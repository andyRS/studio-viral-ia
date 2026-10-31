// Directores: cola de guardado, deshacer por operación y mínimo del lienzo central. npm test
import { crearCola } from "../src/components/studio/cola";
import { esAplicada, opDesplazarLarga, opDuplicarCorta, opEditarCorta, opEditarLarga, type Op } from "../src/components/studio/operaciones";
import { ajustarAnchos, MIN_CENTRO } from "../src/components/studio/Divisores";
import { mapNode, normOutline, saveScript, allScenes, type Outline } from "../src/lib/outline";

let fallos = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "ok" : "FALLA"} · ${m}`); if (!c) fallos++; };
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. Dos ediciones seguidas con guardado lento: la segunda parte del resultado de la primera.
  {
    const guardados: any[] = [];
    const cola = crearCola<any>(async v => { await espera(80); guardados.push(v); return v; });
    cola.sincronizar({ a: 1, b: 1 });
    const p1 = cola.aplicar(base => ({ valor: { ...base, a: 2 } }));
    const p2 = cola.aplicar(base => ({ valor: { ...base, b: 2 } }));
    cola.sincronizar({ a: 1, b: 1 });   // un render con props viejas mientras guardan: se ignora
    await Promise.all([p1, p2]);
    ok(guardados.length === 2 && guardados[1].a === 2 && guardados[1].b === 2, "con guardado lento, dos ediciones seguidas no se pisan");
    ok(cola.actual.a === 2 && cola.actual.b === 2, "la cola termina en el último estado guardado");
  }

  // 2. Proyecto largo: editar un detalle → guardar el guion por otro camino → deshacer: el guion se conserva.
  {
    let o: Outline = normOutline({ acts: [{ title: "A", sequences: [{ title: "S", scenes: [{ heading: "EXT. RÍO", summary: "original" }, { heading: "INT. CASA", summary: "dos" }] }] }] }, "s", 3, 20);
    const id = allScenes(o)[0].id;
    const cola = crearCola<Outline>(async v => { await espera(20); o = v; return v; });
    cola.sincronizar(o);
    const ejecutar = async (op: Op<Outline>) => { let inv: Op<Outline> | null = null; await cola.aplicar(base => { const r = op(base); if (!r || !esAplicada(r)) return null; inv = r.inversa; return { valor: r.valor }; }); return inv as Op<Outline> | null; };
    const deshacerEdicion = await ejecutar(opEditarLarga(id, "summary", "editado en el director"));
    await cola.aplicar(base => ({ valor: saveScript(base, id, [{ type: "dialogo", speaker: "Daniel", text: "Señor, escucha." }], "guion a mano") }));
    await ejecutar(deshacerEdicion!);
    const sc = allScenes(o)[0];
    ok(sc.summary === "original", "deshacer revierte solo el detalle editado");
    ok(sc.script?.[0]?.text === "Señor, escucha.", "deshacer no borra el guion guardado después por el editor de guion");
    // Mover: la inversa vuelve la escena a su sitio aunque otras cosas hayan cambiado.
    const deshacerMover = await ejecutar(opDesplazarLarga(allScenes(o)[1].id, -1));
    ok(allScenes(o)[0].heading === "INT. CASA", "mover relativo calcula el destino sobre el estado actual");
    await cola.aplicar(base => ({ valor: mapNode(base, id, n => ({ ...n, objective: "nuevo" })) }));
    await ejecutar(deshacerMover!);
    ok(allScenes(o)[0].heading === "EXT. RÍO" && allScenes(o)[0].objective === "nuevo", "deshacer un movimiento conserva los cambios hechos después");
    o = mapNode(o, id, n => ({ ...n, locked: true })); cola.sincronizar(o);
    const r = opDesplazarLarga(allScenes(o)[1].id, -1)(o);
    ok(!!r && !esAplicada(r) && /Desbloquea/.test(r.motivo), "no atraviesa una escena bloqueada y explica por qué");
  }

  // 3. Episodio corto: editar, duplicar y deshacer en orden inverso deja todo como estaba.
  {
    let out: any = { scenes: [1, 2, 3].map(n => ({ n, speaker: "A", line: `F${n}`, emotion: "calma" })), guionJson: { clips: [1, 2, 3].map(n => [["A", `F${n}`]]) } };
    const pila: Op<any>[] = [];
    const hacer = (op: Op<any>) => { const r = op(out); if (r && esAplicada(r)) { out = r.valor; pila.push(r.inversa); return r; } return null; };
    const deshacer = () => { const r = pila.pop()!(out); if (r && esAplicada(r)) out = r.valor; };   // como el hook: la inversa va a «rehacer», no a esta pila
    hacer(opEditarCorta(2, "line", "Cambiada"));
    out = { ...out, scenes: out.scenes.map((s: any) => (s.n === 3 ? { ...s, emotion: "rabia" } : s)) };   // otro camino cambia otra escena
    const dup = hacer(opDuplicarCorta(2));
    ok(out.scenes.length === 4 && dup!.mapa![3] === 4, "duplicar renumera las siguientes (revisiones y archivos las siguen)");
    deshacer();
    ok(out.scenes.length === 3 && out.guionJson.clips.length === 3, "deshacer la duplicación quita solo la copia");
    deshacer();
    ok(out.scenes[1].line === "F2" && out.guionJson.clips[1][0][1] === "F2" && out.scenes[2].emotion === "rabia", "deshacer la edición no revierte lo cambiado por otro camino");
  }

  // 4. Divisores: el lienzo central conserva siempre su mínimo.
  {
    for (const disponible of [1100, 1300, 1600]) {
      const a = ajustarAnchos({ izq: 420, der: 520 }, disponible);
      ok(disponible - a.izq - a.der - 36 >= MIN_CENTRO, `con ${disponible} px el centro conserva ≥ ${MIN_CENTRO} px (izq ${a.izq}, der ${a.der})`);
    }
    const sin = ajustarAnchos({ izq: 300, der: 340 }, 0);
    ok(sin.izq === 300 && sin.der === 340, "sin medida todavía se respetan los anchos guardados");
  }

  if (fallos) { console.log(`${fallos} prueba(s) fallaron`); process.exit(1); }
})();
