"use client";
// Ideas con IA: conversación para pedir ideas nuevas (nunca una lista fija), con modo personaje bíblico.
// Cada tanda evita repetir lo ya propuesto y las series existentes.
import { useState } from "react";
import { postApi, isAuthError } from "@/lib/api-client";
import { BIBLE_STORIES, templateIdeas, type StoryIdea } from "@/lib/ideas";
import type { StyleKey } from "@/lib/knowledge";

type Turn = { role: "user" | "ia"; text: string; ideas?: StoryIdea[] };

export default function IdeasPanel({ style, online, existing, onUse, busy: creating = false, accountProfile = "" }: {
  style: StyleKey; online: boolean; existing: string[]; onUse: (idea: StoryIdea, start?: boolean) => void; busy?: boolean; accountProfile?: string;
}) {
  const [direction, setDirection] = useState("");
  const [bibleOn, setBibleOn] = useState(false);
  const [character, setCharacter] = useState("");
  const [bibleMode, setBibleMode] = useState<"epoca" | "moderna">("moderna");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState<string>("");

  async function ask(more = false) {
    if (bibleOn && !character.trim()) return;
    const request = direction.trim() || (more ? "Dame más ideas distintas" : bibleOn ? `Ideas con ${character.trim()}` : "Sorpréndeme con ideas que enganchen");
    const shown = turns.flatMap(t => (t.ideas || []).map(i => i.idea));
    const body = {
      style, direction: request, count: 4, accountProfile,
      biblical: bibleOn ? { character: character.trim(), mode: bibleMode } : null,
      avoid: [...existing, ...shown],
      history: turns.map(t => ({ role: t.role, text: t.role === "ia" ? `${t.text} Ideas: ${(t.ideas || []).map(i => i.title).join("; ")}` : t.text })),
    };
    setBusy(true);
    setTurns(prev => [...prev, { role: "user", text: request }]);
    setDirection("");
    try {
      let reply = "", ideas: StoryIdea[] = [];
      if (!online) { ideas = templateIdeas(body); reply = "Sin sesión: ideas combinadas al azar con la fórmula que funciona. Inicia sesión para que las escriba la IA."; }
      else {
        const r = await postApi("/api/ideas", body);
        if (isAuthError(r)) { ideas = templateIdeas(body); reply = "Inicia sesión para que la IA escriba las ideas. Mientras, combinaciones al azar con la fórmula."; }
        else if (!r.json?.ok) { ideas = templateIdeas(body); reply = `No se pudo consultar a la IA (${r.json?.error || "HTTP " + r.status}). Te dejo combinaciones al azar.`; }
        else { ideas = r.json.data.ideas || []; reply = r.json.data.reply || ""; }
      }
      setTurns(prev => [...prev, { role: "ia", text: reply, ideas }]);
    } finally { setBusy(false); }
  }

  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs ${on ? "border-amber-400/60 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[.03] text-slate-300"}`;

  return <section className="rounded-2xl border border-violet-400/25 bg-violet-500/[.06] p-4" aria-label="Ideas con IA">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-bold text-white">✨ Ideas con IA</h3>
      <span className="text-xs text-slate-400">Pide, ajusta y vuelve a pedir: cada tanda es nueva.</span>
      {turns.length > 0 && <button type="button" onClick={() => setTurns([])} className="ml-auto text-xs text-slate-400 hover:text-white">Empezar de nuevo</button>}
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={bibleOn} onClick={() => setBibleOn(!bibleOn)} className={chip(bibleOn)}>📖 Personaje bíblico</button>
      {bibleOn && <>
        <input list="bible-characters" value={character} onChange={e => setCharacter(e.target.value)} placeholder="José, Rut, Sansón, Ester…" className="w-48 py-1.5 text-sm" aria-label="Personaje bíblico" />
        <datalist id="bible-characters">{BIBLE_STORIES.map(b => <option key={b.name} value={b.name}>{b.base}</option>)}</datalist>
        <button type="button" onClick={() => setBibleMode("epoca")} className={chip(bibleMode === "epoca")}>Época bíblica</button>
        <button type="button" onClick={() => setBibleMode("moderna")} className={chip(bibleMode === "moderna")}>Adaptación moderna (RD)</button>
      </>}
    </div>

    {turns.length > 0 && <div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
      {turns.map((t, k) => t.role === "user"
        ? <p key={k} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-amber-400/15 px-3 py-2 text-sm text-amber-50">{t.text}</p>
        : <div key={k} className="space-y-2">
          {t.text && <p className="text-xs text-slate-300">{t.text}</p>}
          <div className="grid gap-2 md:grid-cols-2">{(t.ideas || []).map((i, n) => <article key={n} className={`rounded-xl border p-3 ${used === i.idea ? "border-emerald-400/60 bg-emerald-400/[.06]" : "border-white/10 bg-[#121826]"}`}>
            <div className="flex flex-wrap items-center gap-2"><b className="text-sm text-white">{i.title}</b>{i.mechanism && <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] text-violet-200">{i.mechanism}</span>}{i.biblicalBase && <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] text-sky-200">📖 {i.biblicalBase}</span>}</div>
            <p className="mt-1 text-sm text-slate-200">{i.idea}</p>
            {i.hook.length > 0 && <p className="mt-2 text-sm font-bold text-amber-200">«{i.hook.join(" / ")}»</p>}
            <dl className="mt-1 space-y-0.5 text-xs text-slate-400">
              {i.object && <div><dt className="inline font-semibold text-slate-300">Objeto: </dt><dd className="inline">{i.object}</dd></div>}
              {i.twist && <div><dt className="inline font-semibold text-slate-300">Giro: </dt><dd className="inline">{i.twist}</dd></div>}
              {!!i.cast?.length && <div><dt className="inline font-semibold text-slate-300">Elenco: </dt><dd className="inline">{i.cast.map(c => `${c.name}${c.fruit ? ` (${c.fruit})` : ""}`).join(", ")}</dd></div>}
              {i.why && <div><dt className="inline font-semibold text-slate-300">Por qué engancha: </dt><dd className="inline">{i.why}</dd></div>}
            </dl>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" disabled={creating} onClick={() => { setUsed(i.idea); onUse(i, true); }} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-60">{creating && used === i.idea ? "Creando la serie…" : "Crear con esta idea →"}</button>
              <button type="button" disabled={creating} onClick={() => { setUsed(i.idea); onUse(i, false); }} className="text-xs text-slate-300 hover:text-white">Solo pasar al formulario</button>
            </div>
          </article>)}</div>
        </div>)}
    </div>}

    <form className="mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void ask(turns.length > 0); }}>
      <input value={direction} onChange={e => setDirection(e.target.value)} disabled={busy}
        placeholder={turns.length ? "Ajusta: «más modernas», «con Navidad», «otra con la suegra»…" : "¿Qué buscas? (opcional): «madre negada», «algo con un pastor»…"}
        className="min-w-0 flex-1 py-2 text-sm" aria-label="Qué ideas quieres" />
      <button type="submit" disabled={busy || (bibleOn && !character.trim())} className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Pensando…" : turns.length ? "Más ideas" : "Generar ideas"}</button>
    </form>
    {bibleOn && !character.trim() && <p className="mt-1 text-xs text-amber-200">Escribe el personaje bíblico.</p>}
  </section>;
}
