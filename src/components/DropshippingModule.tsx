"use client";

import { useRef, useState, type FormEvent } from "react";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateDropshipping } from "@/lib/llm";
import type { Product } from "@/lib/types";

export default function DropshippingModule() {
  const { data, insert, update, remove, mode } = useData();
  const products = data.products;
  const tests = data.productTests;
  const [form, setForm] = useState({ name: "", link: "", cost: "", sale: "", photo: "" });
  const [selectedId, setSelectedId] = useState("");
  const [out, setOut] = useState<any>(null);
  const [outProductId, setOutProductId] = useState("");
  const [authError, setAuthError] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testForm, setTestForm] = useState({ productId: "", views: "", sales: "", revenue: "", isWinner: false });
  const formRef = useRef<HTMLFormElement>(null);
  const selected = products.find(product => product.id === selectedId);
  const productName = (id: string) => products.find(product => product.id === id)?.name || "Producto eliminado";
  const hasPrices = form.cost !== "" && form.sale !== "";
  const margin = Number(form.sale) - Number(form.cost);
  const percent = Number(form.sale) ? ((margin / Number(form.sale)) * 100).toFixed(1) : "0";

  function draftReady() {
    if (!formRef.current?.reportValidity()) return false;
    if (!form.name.trim()) {
      setNotice("Escribe el nombre del producto antes de guardarlo o generar contenido.");
      return false;
    }
    return true;
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftReady()) return;
    setBusy(true);
    setNotice("");
    try {
      const created = await insert("products", { name: form.name.trim(), link: form.link, costPrice: Number(form.cost), salePrice: Number(form.sale), photos: form.photo ? [form.photo] : [] });
      if (created?.id) {
        setSelectedId(created.id);
        setNotice(mode === "supabase" ? "Producto guardado en tu cuenta." : "Producto guardado en este navegador.");
      } else setNotice("No se pudo guardar el producto. Inténtalo de nuevo.");
    } catch {
      setNotice("No se pudo guardar el producto. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function applyOut(productId: string, generated: any, note: string) {
    setOut(generated);
    setOutProductId(productId);
    setNotice(note);
    if (productId) await update("products", productId, { angles: generated.angles, scripts: generated.scripts, seedancePrompt: generated.seedancePrompt, landing: generated.landing });
  }

  async function genLocal() {
    setAuthError(false);
    if (!selected && !draftReady()) return;
    setBusy(true);
    setNotice("");
    try {
      let productId = selected?.id || "";
      if (!productId) {
        const created = await insert("products", { name: form.name.trim(), link: form.link, costPrice: Number(form.cost), salePrice: Number(form.sale), photos: form.photo ? [form.photo] : [] });
        productId = created?.id || "";
        if (!productId) throw new Error("No se pudo guardar el producto.");
        if (productId) setSelectedId(productId);
      }
      await applyOut(productId, templateDropshipping({ product: { name: selected?.name || form.name.trim() } }), "Generado con plantilla local, sin IA, y guardado en el producto.");
    } catch {
      setNotice("No se pudo generar el contenido. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setAuthError(false);
    setNotice("");
    if (mode !== "supabase") { await genLocal(); return; }
    if (!selected && !draftReady()) return;
    setBusy(true);
    try {
      let productId = selected?.id || "";
      if (!productId) {
        const created = await insert("products", { name: form.name.trim(), link: form.link, costPrice: Number(form.cost), salePrice: Number(form.sale), photos: form.photo ? [form.photo] : [] });
        productId = created?.id || "";
        if (!productId) throw new Error("No se pudo guardar el producto.");
        if (productId) setSelectedId(productId);
      }
      const productForApi = selected || { name: form.name.trim(), link: form.link, costPrice: Number(form.cost), salePrice: Number(form.sale) };
      const response = await postApi("/api/dropshipping", { product: productForApi });
      if (isAuthError(response)) { setAuthError(true); return; }
      if (!response.json?.data) { setNotice("Error de la API: " + (response.json?.error || ("HTTP " + response.status))); return; }
      await applyOut(productId, response.json.data, response.json.mode === "plantilla-local" ? "Generado con plantilla local del servidor y guardado en el producto." : "Generado con IA y guardado en el producto.");
    } catch {
      setNotice("No se pudo generar el contenido. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function addTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const productId = testForm.productId || selected?.id;
    if (!productId) return;
    setTestBusy(true);
    try {
      await insert("productTests", { productId, views: Number(testForm.views), sales: Number(testForm.sales), revenue: Number(testForm.revenue), isWinner: testForm.isWinner });
      setTestForm({ productId, views: "", sales: "", revenue: "", isWinner: false });
      setNotice("Prueba registrada con los valores que ingresaste.");
    } catch {
      setNotice("No se pudo registrar la prueba. Inténtalo de nuevo.");
    } finally {
      setTestBusy(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`¿Eliminar «${product.name}» del estudio?`)) return;
    await remove("products", product.id);
    if (selectedId === product.id) {
      setSelectedId("");
      setOut(null);
      setOutProductId("");
    }
    if (testForm.productId === product.id) setTestForm({ ...testForm, productId: "" });
  }

  const showOut = (out && outProductId === selectedId ? out : null)
    || (selected && (selected.angles || selected.landing) ? { angles: selected.angles, scripts: selected.scripts, seedancePrompt: selected.seedancePrompt, landing: selected.landing } : null);
  const winners = tests.filter(test => test.isWinner);

  return <section className="space-y-6" aria-labelledby="dropshipping-title">
    <div>
      <p className="studio-eyebrow">Espacio independiente / Comercio</p>
      <h2 id="dropshipping-title" className="mt-1 text-2xl font-bold tracking-tight text-white">Dropshipping orgánico</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">Guarda productos, prepara contenido y registra las pruebas con tus propios datos.</p>
      <p className="mt-1 text-xs text-slate-400">{mode === "supabase" ? "Datos guardados en tu cuenta." : "Modo local: datos guardados en este navegador."}</p>
    </div>

    <form ref={formRef} onSubmit={saveProduct} className="studio-panel p-4 sm:p-5">
      <div><p className="studio-eyebrow">Ficha de producto</p><h3 className="mt-1 text-lg font-bold text-white">Nuevo producto</h3></div>
      {selected && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FF9F1C]/25 bg-[#FF9F1C]/[.08] p-3 text-sm"><p className="text-slate-200">La generación usará <strong className="text-white">{selected.name}</strong>.</p><button type="button" onClick={() => setSelectedId("")} className="rounded-lg border border-[#FF9F1C]/30 px-3 py-2 text-xs font-semibold text-[#FFCB85] hover:bg-[#FF9F1C]/10">Usar producto nuevo</button></div>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2"><label htmlFor="product-name" className="field-label block">Nombre del producto</label><input id="product-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Nombre del producto" required /></div>
        <div className="sm:col-span-2"><label htmlFor="product-link" className="field-label block">Enlace de compra</label><input id="product-link" type="url" value={form.link} onChange={event => setForm({ ...form, link: event.target.value })} placeholder="https://..." /></div>
        <div><label htmlFor="product-cost" className="field-label block">Costo (US$)</label><input id="product-cost" type="number" min="0" step="0.01" value={form.cost} onChange={event => setForm({ ...form, cost: event.target.value })} placeholder="0.00" required /></div>
        <div><label htmlFor="product-sale" className="field-label block">Precio de venta (US$)</label><input id="product-sale" type="number" min="0" step="0.01" value={form.sale} onChange={event => setForm({ ...form, sale: event.target.value })} placeholder="0.00" required /></div>
        <div className="sm:col-span-2"><label htmlFor="product-photo" className="field-label block">URL de foto (opcional)</label><input id="product-photo" type="url" value={form.photo} onChange={event => setForm({ ...form, photo: event.target.value })} placeholder="https://..." /></div>
      </div>
      <p className="mt-4 text-sm text-slate-300">Margen calculado: {hasPrices ? <strong className={margin >= 0 ? "text-emerald-300" : "text-rose-300"}>US${margin.toFixed(2)} ({percent}%)</strong> : <span className="text-slate-400">ingresa costo y precio</span>}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10">{busy ? "Procesando…" : "Guardar producto"}</button>
        <button type="button" disabled={busy} onClick={generate} className="rounded-xl bg-[#FF9F1C] px-4 py-2.5 text-sm font-bold text-[#090D16] hover:brightness-110">Generar ángulos, guiones y landing</button>
      </div>
      <p className="mt-2 text-xs text-slate-400">Si seleccionas un producto guardado, la generación usará ese producto.</p>
    </form>

    {authError && <AiAuthNotice onLocalTemplate={genLocal} />}
    {notice && <p role="status" className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">{notice}</p>}

    <section aria-labelledby="products-title">
      <div className="flex flex-wrap items-end justify-between gap-2"><h3 id="products-title" className="text-lg font-bold text-white">Productos guardados</h3><span className="text-xs text-slate-400">{products.length} en el estudio</span></div>
      {products.length ? <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{products.map(product => {
        const productMargin = product.salePrice - product.costPrice;
        const productPercent = product.salePrice ? ((productMargin / product.salePrice) * 100).toFixed(1) : "0";
        return <article key={product.id} className={`studio-panel min-w-0 overflow-hidden ${selectedId === product.id ? "!border-[#FF9F1C]/50" : ""}`}>
          <button type="button" aria-pressed={selectedId === product.id} onClick={() => setSelectedId(product.id)} className="block w-full p-4 text-left sm:p-5">
            <div className="flex items-start justify-between gap-2"><h4 className="min-w-0 break-words font-bold text-white">{product.name}</h4>{selectedId === product.id && <span className="shrink-0 rounded-full bg-[#FF9F1C]/15 px-2 py-1 text-[11px] font-semibold text-[#FFCB85]">Seleccionado</span>}</div>
            {product.photos?.[0] && <img src={product.photos[0]} alt={product.name} loading="lazy" className="mt-3 max-h-44 w-full rounded-xl object-cover" />}
            <p className="mt-3 text-sm text-slate-300">Costo US${Number(product.costPrice).toFixed(2)} · Venta US${Number(product.salePrice).toFixed(2)}</p>
            <p className="mt-1 text-sm">Margen <span className={productMargin >= 0 ? "text-emerald-300" : "text-rose-300"}>US${productMargin.toFixed(2)} ({productPercent}%)</span></p>
            {product.angles && <p className="mt-2 text-xs text-slate-400">Contenido generado guardado</p>}
          </button>
          <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
            {product.link && <a href={product.link} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-[#B7CAFF] hover:bg-white/5">Abrir enlace ↗</a>}
            <button type="button" onClick={() => deleteProduct(product)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-rose-500/10 hover:text-rose-200">Eliminar</button>
          </div>
        </article>;
      })}</div> : <div className="studio-panel mt-3 border-dashed p-6 text-sm text-slate-300">Todavía no hay productos guardados.</div>}
    </section>

    {showOut && <section className="studio-panel space-y-4 break-words p-4 text-sm sm:p-5" aria-label="Contenido generado">
      <div><p className="studio-eyebrow">Contenido del producto</p><h3 className="mt-1 text-lg font-bold text-white">{selected?.name || "Contenido generado"}</h3></div>
      {!!showOut.angles?.length && <div><h4 className="font-semibold text-[#FFCB85]">Ángulos</h4><ol className="mt-2 ml-5 list-decimal space-y-1 text-slate-200">{showOut.angles.map((angle: string, index: number) => <li key={index}>{angle}</li>)}</ol></div>}
      {!!showOut.scripts?.length && <div><h4 className="font-semibold text-[#FFCB85]">Guiones</h4><div className="mt-2 space-y-2 text-slate-200">{showOut.scripts.map((script: any, index: number) => <p key={index}>{typeof script === "string" ? script : script.script}</p>)}</div></div>}
      {showOut.seedancePrompt && <div><h4 className="font-semibold text-[#FFCB85]">Prompt Seedance</h4><p className="mt-1 whitespace-pre-wrap text-slate-200">{showOut.seedancePrompt}</p></div>}
      {showOut.landing && <div><h4 className="font-semibold text-[#FFCB85]">Landing propuesta</h4><p className="mt-1 text-slate-200">{showOut.landing.headline}</p><p className="mt-1 text-slate-300">{(showOut.landing.benefits || []).join(" · ")}</p>{showOut.landing.socialProof && <p className="mt-1 text-slate-300">Texto de prueba social propuesto: {showOut.landing.socialProof}</p>}{showOut.landing.cta && <p className="mt-1 text-slate-300">CTA: {showOut.landing.cta}</p>}{!!showOut.landing.faq?.length && <p className="mt-1 text-slate-300">FAQ: {showOut.landing.faq.map((item: any) => item.q + " " + item.a).join(" | ")}</p>}</div>}
    </section>}

    <section className="studio-panel p-4 sm:p-5" aria-labelledby="tests-title">
      <div><p className="studio-eyebrow">Experimentación</p><h3 id="tests-title" className="mt-1 text-lg font-bold text-white">Registrar prueba</h3><p className="mt-1 text-sm text-slate-300">Registra vistas, ventas e ingresos observados. La etiqueta de ganador la decides tú.</p></div>
      <form className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5" onSubmit={addTest}>
        <div className="sm:col-span-2 xl:col-span-1"><label htmlFor="test-product" className="field-label block">Producto</label><select id="test-product" value={testForm.productId || selectedId} onChange={event => setTestForm({ ...testForm, productId: event.target.value })} required><option value="">Selecciona un producto</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>
        <div><label htmlFor="test-views" className="field-label block">Vistas</label><input id="test-views" type="number" min="0" step="1" value={testForm.views} onChange={event => setTestForm({ ...testForm, views: event.target.value })} required /></div>
        <div><label htmlFor="test-sales" className="field-label block">Ventas</label><input id="test-sales" type="number" min="0" step="1" value={testForm.sales} onChange={event => setTestForm({ ...testForm, sales: event.target.value })} required /></div>
        <div><label htmlFor="test-revenue" className="field-label block">Ingresos (US$)</label><input id="test-revenue" type="number" min="0" step="0.01" value={testForm.revenue} onChange={event => setTestForm({ ...testForm, revenue: event.target.value })} required /></div>
        <label className="flex items-center gap-2 self-end rounded-xl border border-white/10 px-3 py-2.5 text-sm text-slate-200"><input type="checkbox" className="w-auto" checked={testForm.isWinner} onChange={event => setTestForm({ ...testForm, isWinner: event.target.checked })} />Marcar ganador</label>
        <div className="sm:col-span-2 xl:col-span-5"><button type="submit" disabled={testBusy || !products.length} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10">{testBusy ? "Guardando…" : "Registrar prueba"}</button></div>
      </form>
      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-white">Pruebas registradas</h4><span className="text-xs text-slate-400">{tests.length} pruebas · {winners.length} marcadas como ganadoras</span></div>
        {tests.length ? <ul className="mt-3 space-y-2">{tests.map(test => <li key={test.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.02] p-3 text-sm"><span className="min-w-0 text-slate-200">{test.isWinner && <span className="mr-1 text-amber-300" aria-label="Marcado como ganador">★</span>}<strong>{productName(test.productId)}</strong> · {test.views.toLocaleString()} vistas · {test.sales} ventas · US${Number(test.revenue || 0).toFixed(2)}</span><button type="button" onClick={() => { if (window.confirm("¿Eliminar esta prueba?")) remove("productTests", test.id); }} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-rose-500/10 hover:text-rose-200">Eliminar</button></li>)}</ul> : <p className="mt-3 text-sm text-slate-400">Todavía no hay pruebas registradas.</p>}
      </div>
    </section>
  </section>;
}
