"use client";
import { useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import type { Formula } from "@/lib/types";

const CATEGORY_LABELS: Record<string, string> = {
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

  return <section>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-xl font-bold">Fórmulas virales</h2>
        <p className="mt-1 text-sm text-slate-400">Estructuras narrativas para consultar y reutilizar.</p>
      </div>
      <span className="rounded-full border border-white/10 bg-white/[.03] px-3 py-1 text-xs text-slate-300">{items.length} guardadas</span>
    </div>
    <p className="mt-2 text-xs text-slate-400">{mode === "cargando" ? "Cargando tus fórmulas…" : mode === "supabase" ? "Los cambios se guardan en tu cuenta." : "Modo local: los cambios se guardan en este navegador."}</p>
    {notice && <p role="status" className="mt-3 rounded-xl border border-white/10 bg-white/[.04] p-3 text-sm text-slate-200">{notice}</p>}

    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {items.map(formula => <article key={formula.id} className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-[#121826] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full border border-amber-400/25 bg-amber-400/[.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200">{categoryLabel(formula.category)}</span>
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
        <div className="mt-auto pt-4">
          <details className="border-t border-white/10 pt-3">
            <summary className="cursor-pointer text-xs font-semibold text-amber-200">Ver contenido y pasos</summary>
            <FormulaDetails formula={formula} />
          </details>
        </div>
      </article>)}
      {items.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 bg-[#151c2b] p-6 text-sm text-slate-300">Aún no hay fórmulas guardadas. Crea la primera abajo.</div>}
    </div>

    <form className="mt-7 rounded-2xl border border-white/10 bg-[#121826] p-4 sm:p-5" onSubmit={submit}>
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
      <button type="submit" disabled={saving || mode === "cargando"} className="mt-4 rounded bg-amber-500 px-4 py-2 font-bold text-black">{saving ? "Guardando…" : "Guardar fórmula"}</button>
    </form>
  </section>;
}
