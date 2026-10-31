"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import WorkspaceIntro, { WorkspaceLoading } from "./WorkspaceIntro";

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const localDateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
const shortDate = (date: Date) => new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "short" }).format(date);

export default function CalendarModule({ focusEntryId }: { focusEntryId?: string }) {
  const { data, insert, remove, mode } = useData();
  const entries = data.calendarEntries;
  const accounts = data.accounts;
  const [today, setToday] = useState<Date | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [ignoreFocusedWeek, setIgnoreFocusedWeek] = useState(false);
  const [view, setView] = useState<"week" | "agenda">("week");
  const [accountFilter, setAccountFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: "", title: "", accountId: "", platform: "TikTok" });

  useEffect(() => {
    if (focusEntryId) { setIgnoreFocusedWeek(false); setWeekOffset(0); setAccountFilter(""); setPlatformFilter(""); }
  }, [focusEntryId]);
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
    if (!form.date || !title || busy) return;
    setBusy(true); setFormMessage("");
    try {
      await insert("calendarEntries", { date: form.date, title, accountId: form.accountId || undefined, platform: form.platform });
      setForm(previous => ({ ...previous, title: "" }));
      setFormMessage(`«${title}» se añadió al plan del ${form.date}.`);
    } catch (error) { setFormMessage(error instanceof Error ? error.message : "No se pudo añadir al plan. Conservamos los campos para que puedas reintentar."); }
    finally { setBusy(false); }
  }
  async function confirmDelete(id: string) {
    await remove("calendarEntries", id);
    setPendingDeleteId(null);
  }
  const accountName = (id?: string) => accounts.find(account => account.id === id)?.name;

  if (!today || mode === "cargando") return <WorkspaceLoading label="Publish & Grow / Calendario" />;

  const focusedEntry = entries.find(entry => entry.id === focusEntryId);
  const focusedParts = focusedEntry?.date?.split("-").map(Number);
  const displayDate = !ignoreFocusedWeek && focusedParts?.length === 3 && focusedParts.every(Number.isFinite)
    ? new Date(focusedParts[0], focusedParts[1] - 1, focusedParts[2])
    : today;
  const monday = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setDate(monday.getDate() + weekOffset * 7);
  const week = days.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = localDateKey(date);
    const items = entries.filter(entry => entry.date === key && (!accountFilter || entry.accountId === accountFilter) && (!platformFilter || entry.platform === platformFilter));
    return { label, key, date, items };
  });
  const emptyDays = week.filter(day => day.items.length === 0);
  const weekCount = week.reduce((count, day) => count + day.items.length, 0);

  const selectDate = (date: string) => {
    setForm(previous => ({ ...previous, date }));
    document.getElementById("calendar-title")?.focus({ preventScroll: true });
    document.getElementById("calendar-composer")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  };
  const goToday = () => { setIgnoreFocusedWeek(true); setWeekOffset(0); setAccountFilter(""); setPlatformFilter(""); setForm(previous => ({ ...previous, date: localDateKey(today) })); };
  const visibleEntries = week.flatMap(day => day.items);

  return <section className="growth-workspace publish-workspace space-y-5">
    <WorkspaceIntro eyebrow="Publish & Grow / Calendario" title="Dale ritmo a tus historias." description="Tu semana de contenido, con cada publicación en su lugar. Planifica por cuenta y deja espacio para la próxima idea." index="03 / PUBLICAR">
      <a href="#calendar-composer" className="studio-primary-action">+ Planificar publicación</a>
      <p className="growth-source">{mode === "supabase" ? "Plan de tu cuenta" : "Plan de este navegador"} · planificación manual</p>
    </WorkspaceIntro>

    <div className="growth-summary" aria-label="Resumen de la semana visible">
      <div><span>PUBLICACIONES</span><strong>{weekCount.toString().padStart(2, "0")}</strong><small>En la semana y filtros visibles</small></div>
      <div><span>DÍAS CON CONTENIDO</span><strong>{7 - emptyDays.length}<em>/ 7</em></strong><small>Distribución del plan</small></div>
      <div><span>CUENTAS EN EL PLAN</span><strong>{new Set(visibleEntries.map(entry => entry.accountId).filter(Boolean)).size}</strong><small>{visibleEntries.filter(entry => !entry.accountId).length} publicaciones sin cuenta asignada</small></div>
    </div>

    <div className="publish-layout">
    <div className="publish-calendar">
    <div className="growth-toolbar">
      <div><p className="studio-eyebrow">Agenda editorial</p><h3 aria-live="polite">{shortDate(week[0].date)} — {shortDate(week[6].date)} <span>{week[0].date.getFullYear()}</span></h3></div>
      <div className="growth-toolbar-actions"><button type="button" aria-label="Semana anterior" onClick={() => setWeekOffset(previous => previous - 1)}>←</button><button type="button" onClick={goToday}>Hoy</button><button type="button" aria-label="Semana siguiente" onClick={() => setWeekOffset(previous => previous + 1)}>→</button></div>
    </div>
    <div className="publish-filters">
      <label>Cuenta<select value={accountFilter} onChange={event => setAccountFilter(event.target.value)}><option value="">Todas las cuentas</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label>Plataforma<select value={platformFilter} onChange={event => setPlatformFilter(event.target.value)}><option value="">Todas las plataformas</option>{Array.from(new Set(["Instagram", "Facebook", "TikTok", "YouTube Shorts", ...entries.map(entry => entry.platform).filter((value): value is string => !!value)])).map(platform => <option key={platform}>{platform}</option>)}</select></label>
      <div className="growth-segment" role="group" aria-label="Vista del calendario"><button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>Semana</button><button type="button" aria-pressed={view === "agenda"} onClick={() => setView("agenda")}>Agenda</button></div>
    </div>
    {!weekCount && <div className="growth-empty"><span aria-hidden="true">＋</span><h4>{accountFilter || platformFilter ? "No hay entradas para estos filtros." : "Una semana llena de posibilidades."}</h4><p>{accountFilter || platformFilter ? "Prueba otra cuenta, plataforma o semana." : "Elige un día para planificar tu próxima publicación."}</p>{(accountFilter || platformFilter) && <button type="button" className="studio-text-action" onClick={() => { setAccountFilter(""); setPlatformFilter(""); }}>Limpiar filtros</button>}</div>}
    <div className={`publish-days ${view === "agenda" ? "publish-days-agenda" : ""}`} aria-label="Publicaciones de esta semana">
      {(view === "agenda" ? week.filter(day => day.items.length > 0) : week).map(day => <article key={day.key} className="publish-day" data-today={day.key === localDateKey(today)}>
        <div className="flex items-start justify-between gap-2">
          <div><p className="publish-day-label">{day.label}{day.key === localDateKey(today) && <span>Hoy</span>}</p><h4 className="publish-day-number">{day.date.getDate().toString().padStart(2, "0")} <small>{new Intl.DateTimeFormat("es", { month: "short" }).format(day.date)}</small></h4></div>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-300" aria-label={`${day.items.length} publicaciones planificadas`}>{day.items.length}</span>
        </div>
        {day.items.length ? <ul className="publish-entry-list">{day.items.map(entry => <li key={entry.id} id={`calendar-entry-${entry.id}`} tabIndex={-1} className={`publish-entry ${focusEntryId === entry.id ? "publish-entry-focused" : ""}`}>
          <span className="publish-platform">{entry.platform || "Sin plataforma"}</span>
          <p className="break-words text-sm font-medium text-white">{entry.title}</p>
          <p className="mt-1 break-words text-xs text-slate-300">{accountName(entry.accountId) || "Sin cuenta asignada"}</p>
          <p className="mt-1 text-[11px] text-amber-200">Planificada</p>
          {pendingDeleteId === entry.id ? <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 p-2" role="group" aria-label={`Confirmar eliminación de ${entry.title}`}>
            <p className="text-xs text-red-100">¿Quitar del calendario?</p>
            <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="min-h-10 rounded-md border border-white/15 px-2 text-xs" onClick={() => setPendingDeleteId(null)}>Cancelar</button><button type="button" className="min-h-10 rounded-md bg-red-500 px-2 text-xs font-semibold text-white" onClick={() => confirmDelete(entry.id)}>Sí, quitar</button></div>
          </div> : <button type="button" className="mt-2 min-h-10 rounded-md px-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => setPendingDeleteId(entry.id)}>Quitar</button>}
        </li>)}</ul> : <p className="publish-day-empty">Espacio para una historia.</p>}
        <button type="button" className="publish-add-day" aria-label={`Planificar para ${day.label} ${shortDate(day.date)}`} onClick={() => selectDate(day.key)}>+ Añadir</button>
      </article>)}
    </div>
    </div>

    <aside className="publish-composer" id="calendar-composer">
    <form onSubmit={submit}>
      <p className="studio-eyebrow">Próxima en cartelera</p><h3>Añadir al plan</h3><p className="growth-form-note">Reserva un día para tu contenido.</p>
      <div className="mt-5 grid gap-4">
        <div><label htmlFor="calendar-date" className="mb-1 block text-sm">Fecha</label><input id="calendar-date" type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required /></div>
        <div><label htmlFor="calendar-title" className="mb-1 block text-sm">Título</label><input id="calendar-title" placeholder="Ej.: Episodio 2 · Manguito" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required /></div>
        <div><label htmlFor="calendar-account" className="mb-1 block text-sm">Cuenta</label><select id="calendar-account" value={form.accountId} onChange={event => setForm({ ...form, accountId: event.target.value })}><option value="">Sin cuenta asignada</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
        <div><label htmlFor="calendar-platform" className="mb-1 block text-sm">Plataforma</label><select id="calendar-platform" value={form.platform} onChange={event => setForm({ ...form, platform: event.target.value })}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>YouTube Shorts</option></select></div>
      </div>
      <button type="submit" disabled={busy} className="studio-primary-action mt-5 w-full">{busy ? "Añadiendo…" : "Añadir al calendario ↗"}</button>
      {formMessage && <p role="status" className="growth-form-note mt-3">{formMessage}</p>}
      <p className="growth-form-note mt-3">Añadir al plan no publica ni programa envíos automáticos en las plataformas.</p>
    </form>
    <div className="publish-rhythm"><p className="studio-eyebrow">Tu ritmo esta semana</p><div className="publish-rhythm-bars" aria-hidden="true">{week.map(day => <div key={day.key}><i style={{ height: `${8 + Math.min(day.items.length, 6) * 9}px` }} data-active={day.items.length > 0} /><span>{day.label.slice(0, 1)}</span></div>)}</div><p>{weekCount ? `${emptyDays.length} días sin publicaciones en esta vista.` : "Empieza con una publicación y construye tu ritmo."}</p></div>
    </aside>
    </div>
  </section>;
}
