"use client";
import { useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import type { Formula } from "@/lib/types";
import WorkspaceIntro, { WorkspaceLoading } from "./WorkspaceIntro";
import CopyButton from "./CopyButton";

const CATEGORY_LABELS: Record<string, string> = {
  "base-instagram": "Base de Instagram",
  custom: "Personalizada",
  general: "General",
  "tiktok-facebook": "TikTok / Facebook",
  cristiano: "Cristiano",
  "viral-importada": "Importada de un análisis",
};
const categoryLabel = (value: string) => CATEGORY_LABELS[value] || value || "Sin categoría";

function parseImported(formula: Formula): Record<string, unknown> | null {
  if (formula.category !== "viral-importada") return null;
  try {
    const value: unknown = JSON.parse(formula.content);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readable(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join(" · ");
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => {
      const text = readable(item);
      return text ? key.replace(/([A-Z])/g, " $1") + ": " + text : "";
    }).filter(Boolean).join(" · ");
  }
  return "";
}

const FIELD_LABELS: Record<string, string> = {
  hook: "Gancho",
  twist: "Giro",
  closing: "Cierre",
  timeJumps: "Saltos de tiempo",
};
function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, letter => letter.toUpperCase());
}

function formulaPreview(formula: Formula) {
  if (formula.category === "viral-importada") {
    const hook = readable(parseImported(formula)?.hook);
    if (hook) return "Gancho: " + hook;
    return "Estructura importada de un análisis viral.";
  }
  return formula.content;
}

function FormulaDetails({ formula }: { formula: Formula }) {
  const imported = parseImported(formula);
  const importedScenes = imported && Array.isArray(imported.scenes) ? imported.scenes : [];
  const steps = (importedScenes.length ? importedScenes : formula.structure || []).map(readable).filter(Boolean);

  if (imported) {
    const keys = ["hook", "twist", "closing", "timeJumps", ...Object.keys(imported).filter(key => !["formulaName", "scenes", "hook", "twist", "closing", "timeJumps"].includes(key))];
    const fields = keys.map(key => ({ key, text: readable(imported[key]) })).filter(field => field.text);
    return <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
      {fields.length > 0 && <dl className="space-y-3">{fields.map(field => <div key={field.key}><dt className="text-xs font-semibold text-white">{fieldLabel(field.key)}</dt><dd className="mt-1 break-words text-sm leading-6 text-slate-300">{field.text}</dd></div>)}</dl>}
      {steps.length > 0 && <div><p className="text-xs font-semibold text-white">Escenas y pasos</p><ol className="ml-4 mt-2 list-decimal space-y-1 text-sm text-slate-300">{steps.map((step, index) => <li key={index} className="break-words">{step}</li>)}</ol></div>}
      {fields.length === 0 && steps.length === 0 && <p className="text-sm text-slate-300">La fórmula no contiene detalles de estructura para mostrar.</p>}
    </div>;
  }

  if (formula.category === "viral-importada") {
    return <div className="mt-3 max-h-80 overflow-y-auto pr-1">
      {steps.length > 0 ? <ol className="ml-4 list-decimal space-y-1 text-sm text-slate-300">{steps.map((step, index) => <li key={index} className="break-words">{step}</li>)}</ol>
        : <p className="text-sm text-slate-300">No se pudo interpretar la estructura importada. El registro sigue guardado.</p>}
    </div>;
  }

  const contentSteps = formula.content.split(";").map(step => step.trim()).filter(Boolean);
  const equivalent = steps.length > 0 && contentSteps.length === steps.length && contentSteps.every((step, index) => step === steps[index]);
  const showContent = !equivalent || steps.length < 2;
  const showSteps = steps.length > 1 || !equivalent && steps.length > 0;
  return <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
    {showContent && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{formula.content}</p>}
    {showSteps && <div><p className="text-xs font-semibold text-white">Pasos</p><ol className="ml-4 mt-2 list-decimal space-y-1 text-sm text-slate-300">{steps.map((step, index) => <li key={index} className="break-words">{step}</li>)}</ol></div>}
  </div>;
}

export default function FormulasModule(){
  const { data, insert, remove, mode } = useData();
  const items = data.formulas;
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("custom");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const visible = items.filter(formula => (!categoryFilter || formula.category === categoryFilter) && `${formula.name} ${formulaPreview(formula)}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")));
  const selected = visible.find(formula => formula.id === selectedId) || visible[0];
  function inspect(id: string) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 900px)").matches) requestAnimationFrame(() => {
      document.getElementById("formula-inspector")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      document.getElementById("formula-inspector-title")?.focus({ preventScroll: true });
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>){
    event.preventDefault();
    if (!name.trim() || !content.trim()) {
      setNotice("Completa el nombre y el contenido de la fórmula.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      await insert("formulas", { name: name.trim(), content: content.trim(), category, structure: content.split(";").map(step => step.trim()).filter(Boolean) });
      setName("");
      setContent("");
      setNotice(mode === "supabase" ? "Fórmula guardada en tu cuenta." : "Fórmula guardada en este navegador.");
    } catch {
      setNotice("No se pudo guardar la fórmula. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFormula(formula: Formula){
    if (!window.confirm("¿Eliminar la fórmula «" + formula.name + "»? Esta acción no se puede deshacer.")) return;
    try {
      await remove("formulas", formula.id);
      setNotice("Fórmula eliminada.");
    } catch {
      setNotice("No se pudo eliminar la fórmula. Inténtalo de nuevo.");
    }
  }

  if (mode === "cargando") return <WorkspaceLoading label="Creative Studio / Fórmulas" />;
  return <section className="growth-workspace creative-library formulas-studio space-y-6">
    <WorkspaceIntro eyebrow="Creative Studio / Biblioteca narrativa" title="La estructura detrás de la emoción." description="Explora tus fórmulas, estudia cada giro y construye una base para la próxima historia." index="01 / FÓRMULAS">
      <a href="#formula-create" className="studio-primary-action">+ Nueva fórmula</a><p className="growth-source">{items.length} fórmulas · {mode === "supabase" ? "Datos de tu cuenta" : "Datos de este navegador"}</p>
    </WorkspaceIntro>
    {notice && <p role="status" className="mt-3 rounded-xl border border-white/10 bg-white/[.04] p-3 text-sm text-slate-200">{notice}</p>}
    <div className="creative-filterbar"><label>Buscar fórmula<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nombre o gancho…" /></label><label>Filtrar categoría<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">Todas las categorías</option>{Array.from(new Set(items.map(formula => formula.category))).map(value => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></label><span className="creative-result-count" aria-live="polite">{visible.length} {visible.length === 1 ? "resultado" : "resultados"}</span></div>
    <div className="formula-library-layout">
    <div className="formula-catalog">
      {visible.map((formula, index) => <article key={formula.id} data-selected={selected?.id === formula.id} className="formula-catalog-card">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="formula-card-index">F / {String(index + 1).padStart(2, "0")}</p><span className="creative-chip">{categoryLabel(formula.category)}</span>
            <h3 className="mt-2 break-words text-base font-bold leading-snug text-white">{formula.name}</h3>
          </div>
          <details className="relative shrink-0">
            <summary aria-label={"Acciones de " + formula.name} className="list-none cursor-pointer rounded-lg border border-white/10 px-2.5 py-1.5 text-sm font-bold text-slate-300 hover:bg-white/[.06] hover:text-white">···</summary>
            <div className="absolute right-0 top-full z-10 mt-1 min-w-36 rounded-lg border border-white/10 bg-[#202b3c] p-1 shadow-xl">
              <button type="button" onClick={() => void deleteFormula(formula)} className="w-full rounded-md px-3 py-2 text-left text-xs text-slate-200 hover:bg-red-500/10 hover:text-red-200">Eliminar fórmula</button>
            </div>
          </details>
        </div>
        <p className="mt-3 line-clamp-3 break-words text-sm leading-6 text-slate-300">{formulaPreview(formula)}</p>
        <button type="button" className="formula-open" aria-pressed={selected?.id === formula.id} onClick={() => inspect(formula.id)}>Ver contenido y pasos <span aria-hidden="true">↗</span></button>
      </article>)}
      {!visible.length && <div className="growth-empty"><span aria-hidden="true">✦</span><h3>{items.length ? "Ninguna fórmula coincide." : "Tu próxima historia empieza aquí."}</h3><p>{items.length ? "Prueba otro nombre o categoría." : "Guarda una estructura para empezar tu biblioteca."}</p>{!!items.length && <button type="button" className="studio-text-action" onClick={() => { setQuery(""); setCategoryFilter(""); }}>Limpiar filtros</button>}</div>}
    </div>
    <aside className="formula-inspector" id="formula-inspector" aria-label="Detalle de la fórmula seleccionada">
      <p className="studio-eyebrow">CUADERNO DE DIRECCIÓN</p>{selected ? <><span className="creative-chip mt-4">{categoryLabel(selected.category)}</span><h3 id="formula-inspector-title" tabIndex={-1}>{selected.name}</h3><FormulaDetails formula={selected} /><div className="formula-inspector-footer"><CopyButton text={selected.content} label="Copiar contenido guardado" /><p>La fórmula orienta la estructura. Su rendimiento dependerá de cada historia y su publicación.</p></div></> : <p className="creative-note mt-5">Aquí podrás leer el contenido completo y los pasos de una fórmula.</p>}
    </aside>
    </div>
    <form id="formula-create" className="creative-compose" onSubmit={submit}>
      <div className="mb-4">
        <h3 className="text-base font-bold text-white">Nueva fórmula</h3>
        <p className="mt-1 text-xs text-slate-400">Escribe los pasos separados por punto y coma para guardarlos también como lista.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="formula-name" className="field-label block">Nombre de la fórmula</label>
          <input id="formula-name" placeholder="Ej.: Conflicto y revelación" value={name} onChange={event => setName(event.target.value)} required/>
        </div>
        <div>
          <label htmlFor="formula-category" className="field-label block">Categoría</label>
          <select id="formula-category" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="custom">Personalizada</option>
            <option value="general">General</option>
            <option value="tiktok-facebook">TikTok/Facebook</option>
            <option value="cristiano">Cristiano</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="formula-content" className="field-label block">Contenido de la fórmula</label>
          <textarea id="formula-content" rows={4} placeholder="Gancho directo; escalada; revelación; cierre" value={content} onChange={event => setContent(event.target.value)} required/>
        </div>
      </div>
      <button type="submit" disabled={saving} className="mt-4 rounded bg-amber-500 px-4 py-2 font-bold text-black">{saving ? "Guardando…" : "Guardar fórmula"}</button>
      {content.trim() && <div className="formula-draft-preview"><p className="studio-eyebrow">VISTA PREVIA DE LOS PASOS</p><ol>{content.split(";").map(step => step.trim()).filter(Boolean).map((step,index) => <li key={index}><span>{String(index + 1).padStart(2,"0")}</span>{step}</li>)}</ol></div>}
    </form>
  </section>;
}
