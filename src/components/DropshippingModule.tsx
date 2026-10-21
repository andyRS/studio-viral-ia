"use client";
import { useState } from "react";
import AiAuthNotice from "./AiAuthNotice";
import { useData } from "@/lib/DataContext";
import { postApi, isAuthError } from "@/lib/api-client";
import { templateDropshipping } from "@/lib/llm";

export default function DropshippingModule(){
  const { data, insert, update, remove, mode } = useData();
  const products = data.products; const tests = data.productTests;
  const [f, setF] = useState({ name: "Mini licuadora portátil recargable", link: "", cost: 8, sale: 24.99, photo: "" });
  const [selectedId, setSelectedId] = useState("");
  const [out, setOut] = useState<any>(null);
  const [outProductId, setOutProductId] = useState("");
  const [authError, setAuthError] = useState(false);
  const [notice, setNotice] = useState("");
  const [testF, setTestF] = useState({ productId: "", views: "", sales: "", revenue: "", isWinner: false });
  const margin = f.sale - f.cost; const pct = f.sale ? ((margin / f.sale) * 100).toFixed(1) : "0";
  const selected = products.find(p => p.id === selectedId);
  const productName = (id: string) => products.find(p => p.id === id)?.name || "(producto eliminado)";

  async function saveProduct(){
    const created = await insert("products", { name: f.name, link: f.link, costPrice: Number(f.cost), salePrice: Number(f.sale), photos: f.photo ? [f.photo] : [] });
    if (created?.id) { setSelectedId(created.id); setNotice("Producto guardado " + (mode === "supabase" ? "en Supabase (products)." : "en localStorage.")); }
  }
  async function applyOut(productId: string, generated: any, note: string){
    setOut(generated); setOutProductId(productId); setNotice(note);
    if (productId) await update("products", productId, { angles: generated.angles, scripts: generated.scripts, seedancePrompt: generated.seedancePrompt, landing: generated.landing });
  }
  async function genLocal(){
    setAuthError(false);
    let pid = selected?.id || "";
    if (!pid) { const created = await insert("products", { name: f.name, link: f.link, costPrice: Number(f.cost), salePrice: Number(f.sale), photos: f.photo ? [f.photo] : [] }); pid = created?.id || ""; if (pid) setSelectedId(pid); }
    await applyOut(pid, templateDropshipping({ product: { name: selected?.name || f.name } }), "Generado con plantilla local en el cliente (sin IA) y guardado en el producto.");
  }
  async function gen(){
    setAuthError(false); setNotice("");
    if (mode !== "supabase") { await genLocal(); return; }
    let pid = selected?.id || "";
    if (!pid) { const created = await insert("products", { name: f.name, link: f.link, costPrice: Number(f.cost), salePrice: Number(f.sale), photos: f.photo ? [f.photo] : [] }); pid = created?.id || ""; if (pid) setSelectedId(pid); }
    const productForApi = selected || { name: f.name, link: f.link, costPrice: Number(f.cost), salePrice: Number(f.sale) };
    const r = await postApi("/api/dropshipping", { product: productForApi });
    if (isAuthError(r)) { setAuthError(true); return; }
    if (!r.json?.data) { setNotice("Error de la API: " + (r.json?.error || ("HTTP " + r.status))); return; }
    await applyOut(pid, r.json.data, r.json.mode === "plantilla-local" ? "Generado con plantilla local del servidor (sin LLM_API_KEY) y guardado en el producto (Supabase)." : "Generado con IA y guardado en el producto (Supabase).");
  }
  async function addTest(e: any){
    e.preventDefault();
    const pid = testF.productId || selected?.id || products[0]?.id;
    if (!pid) return;
    await insert("productTests", { productId: pid, views: Number(testF.views || 0), sales: Number(testF.sales || 0), revenue: Number(testF.revenue || 0), isWinner: testF.isWinner });
    setTestF({ ...testF, views: "", sales: "", revenue: "" });
  }
  const showOut = out || (selected && (selected.angles || selected.landing) ? { angles: selected.angles, scripts: selected.scripts, seedancePrompt: selected.seedancePrompt, landing: selected.landing } : null);
  const winners = tests.filter(t => t.isWinner);

  return <section>
    <h2 className="text-xl font-bold">Dropshipping orgánico</h2>
    <p className="text-xs text-slate-500 mt-1">{mode === "supabase" ? "Guardado en Supabase (products y product_tests)." : "Modo sin login: localStorage."}</p>

    <div className="grid gap-2 md:grid-cols-4 mt-3">
      <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Producto"/>
      <input value={f.link} onChange={e => setF({ ...f, link: e.target.value })} placeholder="Link AliExpress / Amazon"/>
      <input type="number" value={f.cost} onChange={e => setF({ ...f, cost: Number(e.target.value) })} placeholder="Costo"/>
      <input type="number" value={f.sale} onChange={e => setF({ ...f, sale: Number(e.target.value) })} placeholder="Venta"/>
    </div>
    <input className="mt-2" value={f.photo} onChange={e => setF({ ...f, photo: e.target.value })} placeholder="URL de foto del producto (opcional)"/>
    <p className="text-sm mt-2">Margen calculado: <b className="text-emerald-400">${margin.toFixed(2)} ({pct}%)</b></p>
    <div className="flex gap-2 flex-wrap mt-2">
      <button onClick={saveProduct} className="rounded bg-slate-700 font-bold px-4 py-2">Guardar producto</button>
      <button onClick={gen} className="rounded bg-amber-500 text-black font-bold px-4 py-2">Generar ángulos + guiones + landing</button>
    </div>
    {authError && <AiAuthNotice onLocalTemplate={genLocal}/>}
    {notice && <p className="text-xs text-emerald-300 mt-2">{notice}</p>}

    <h3 className="font-bold mt-5">📦 Productos</h3>
    <div className="grid gap-3 md:grid-cols-3 mt-2">
      {products.map(p => { const m = p.salePrice - p.costPrice; const mp = p.salePrice ? ((m / p.salePrice) * 100).toFixed(1) : "0"; return <article key={p.id} onClick={() => setSelectedId(p.id)} className={`rounded-xl p-4 border cursor-pointer ${selectedId === p.id ? "bg-amber-900/40 border-amber-500" : "bg-[#121826] border-slate-800"}`}>
        <b>{p.name}</b>
        {p.photos?.[0] && <img src={p.photos[0]} alt={p.name} className="mt-2 rounded"/>}
        <p className="text-sm text-slate-400 mt-1">Costo ${Number(p.costPrice).toFixed(2)} · Venta ${Number(p.salePrice).toFixed(2)}<br/>Margen: <span className="text-emerald-400">${m.toFixed(2)} ({mp}%)</span></p>
        {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="text-xs underline text-amber-300" onClick={e => e.stopPropagation()}>Ver link de compra</a>}
        {p.angles && <p className="text-xs text-slate-400 mt-1">✔ Tiene ángulos, guiones y landing generados</p>}
        <div><button className="text-red-400 text-xs mt-2" onClick={e => { e.stopPropagation(); remove("products", p.id); }}>Eliminar</button></div>
      </article>; })}
      {products.length === 0 && <p className="text-sm text-slate-400">Sin productos todavía.</p>}
    </div>

    {showOut && <div className="mt-4 space-y-3 text-sm rounded-xl bg-[#121826] p-4 border border-slate-800">
      <h3 className="font-bold">Contenido generado{selected ? ` — ${selected.name}` : ""}</h3>
      <div><b>5 ángulos:</b><ol className="list-decimal ml-5">{(showOut.angles || []).map((a: string, i: number) => <li key={i}>{a}</li>)}</ol></div>
      <div><b>3 guiones 15-30s:</b>{(showOut.scripts || []).map((s: any, i: number) => <p key={i} className="mt-1">• {typeof s === "string" ? s : s.script}</p>)}</div>
      <p><b>Prompt Seedance:</b> {showOut.seedancePrompt}</p>
      <div><b>Landing:</b> {showOut.landing?.headline} — {(showOut.landing?.benefits || []).join(" · ")} — {showOut.landing?.socialProof} — CTA: {showOut.landing?.cta}<br/>FAQ: {(showOut.landing?.faq || []).map((x: any) => x.q + " " + x.a).join(" | ")}</div>
    </div>}

    <h3 className="font-bold mt-6">🧪 Registrar prueba (vistas y ventas)</h3>
    <form className="flex gap-2 flex-wrap mt-2 items-center" onSubmit={addTest}>
      <select value={testF.productId} onChange={e => setTestF({ ...testF, productId: e.target.value })}>
        <option value="">Producto…</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input type="number" placeholder="Vistas" value={testF.views} onChange={e => setTestF({ ...testF, views: e.target.value })} className="w-28"/>
      <input type="number" placeholder="Ventas" value={testF.sales} onChange={e => setTestF({ ...testF, sales: e.target.value })} className="w-28"/>
      <input type="number" step="0.01" placeholder="Ingresos US$" value={testF.revenue} onChange={e => setTestF({ ...testF, revenue: e.target.value })} className="w-32"/>
      <label className="flex gap-1 text-sm items-center"><input type="checkbox" className="w-auto" checked={testF.isWinner} onChange={e => setTestF({ ...testF, isWinner: e.target.checked })}/> Ganador 🏆</label>
      <button className="rounded bg-slate-700 px-3 py-1 text-sm">Registrar prueba</button>
    </form>

    <h3 className="font-bold mt-5">Productos probados / Ganadores 🏆</h3>
    {tests.map(t => <p key={t.id} className="text-sm mt-1 flex gap-2 items-center"><span>{t.isWinner ? "🏆" : "•"} {productName(t.productId)}: {t.views.toLocaleString()} vistas · {t.sales} ventas · ${Number(t.revenue || 0).toFixed(2)} {t.isWinner && <span className="text-emerald-400">— GANADOR</span>}</span><button className="text-red-400 text-xs" onClick={() => remove("productTests", t.id)}>Eliminar</button></p>)}
    {tests.length === 0 && <p className="text-sm text-slate-400 mt-1">Sin pruebas registradas.</p>}
    {winners.length > 0 && <p className="text-sm text-emerald-300 mt-2">Ganadores detectados: {winners.length} 🏆 — escala esos productos con más videos.</p>}
  </section>;
}
