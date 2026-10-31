// Pruebas de persistencia (sin red ni navegador real): npm test
import { clasificarError, columnasCambiadas, esMigracionPendiente, resolverChoque, claveLocal } from "../src/lib/persistencia";
import { completarCreacion, type CreacionPendiente } from "../src/lib/creacion";

let fallos = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "ok" : "FALLA"} · ${m}`); if (!c) fallos++; };

// Errores: solo «tabla ausente» es migración pendiente; un timeout o un fallo de red no.
ok(clasificarError({ code: "42P01", message: 'relation "public.story_outlines" does not exist' }) === "tabla_ausente", "tabla inexistente (Postgres)");
ok(clasificarError({ code: "PGRST205", message: "Could not find the table 'public.story_outlines' in the schema cache" }) === "tabla_ausente", "tabla inexistente (PostgREST)");
ok(clasificarError({ code: "57014", message: "canceling statement due to statement timeout" }) === "tiempo", "timeout");
ok(clasificarError({ message: "TypeError: Failed to fetch" }) === "red", "sin red");
ok(clasificarError({ code: "42501", message: "permission denied for table story_outlines" }) === "permiso", "permisos");
ok(clasificarError({ status: 503, message: "Service Unavailable" }) === "servicio", "servicio caído");
ok(!esMigracionPendiente(clasificarError({ code: "57014" })) && esMigracionPendiente(clasificarError({ code: "42P01" })), "un timeout no se presenta como «falta migración»");

// Parches: solo columnas cambiadas, nunca id/user_id/revision.
const base = { id: "1", user_id: "u", title: "A", meta: { format: "largo" }, description: "x", revision: 3 };
ok(JSON.stringify(columnasCambiadas(base, { ...base, title: "B", revision: 4 })) === JSON.stringify({ title: "B" }), "parche con solo la columna cambiada");
ok(Object.keys(columnasCambiadas(base, { ...base, meta: { format: "largo" } })).length === 0, "objetos iguales no cuentan como cambio");

// Choques: el otro cambió otra columna → se reintenta; la misma con otro valor → conflicto.
ok(resolverChoque(base, { ...base, description: "y" }, { title: "B" }).reintentar, "cambios en columnas distintas se combinan");
const ch = resolverChoque(base, { ...base, title: "C" }, { title: "B" });
ok(!ch.reintentar && ch.choques[0] === "title", "misma columna con valores distintos es conflicto");
ok(resolverChoque(base, { ...base, title: "B" }, { title: "B" }).reintentar, "si los dos pusieron lo mismo no hay conflicto");

// Respaldo local por usuario.
ok(claveLocal("storyOutlines", "abc") === "u:abc:storyOutlines" && claveLocal("storyOutlines", null) === "storyOutlines", "clave local separada por usuario");

// Creación reanudable: falla el episodio, se reintenta sin repetir serie ni personajes.
(async () => {
  const llamadas: string[] = [];
  let fallarEpisodio = true;
  const pasos = {
    insertarSerie: async () => { llamadas.push("serie"); return { id: "s1" }; },
    insertarPersonaje: async (c: any) => { llamadas.push(`pj:${c.name}`); },
    guardarEpisodio: async () => { llamadas.push("ep"); if (fallarEpisodio) throw new Error("red"); return { episodeId: "e1", output: { title: "x" } }; },
  };
  let guardado: CreacionPendiente = { id: "1", at: "", titulo: "T", serie: {}, personajes: [{ name: "Fresa" }, { name: "Mango" }], episodio: { ep: {}, bible: {} }, hecho: { personajes: [] } };
  try { await completarCreacion(guardado, pasos, p => { guardado = p; }); } catch {}
  ok(guardado.hecho.seriesId === "s1" && guardado.hecho.personajes.length === 2 && !guardado.hecho.episodeId, "lo guardado antes del fallo queda anotado");
  fallarEpisodio = false;
  const r = await completarCreacion(guardado, pasos, p => { guardado = p; });
  ok(r.episodeId === "e1" && llamadas.filter(x => x === "serie").length === 1 && llamadas.filter(x => x === "pj:Fresa").length === 1, "al reintentar no se duplica la serie ni los personajes");

  // Guardado local: cuota llena se informa (no se calla).
  const mem: Record<string, string> = {};
  (globalThis as any).window = globalThis;
  (globalThis as any).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { if (v.length > 50) { const e: any = new Error("The quota has been exceeded."); e.name = "QuotaExceededError"; throw e; } mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
  const { saveSync, save } = await import("../src/lib/store");
  ok(saveSync("x", [1]).ok, "guardado pequeño correcto");
  const r1 = saveSync("x", ["una imagen enorme en base64 que no cabe en el almacenamiento"]);
  ok(!r1.ok && r1.motivo === "cuota", "cuota llena devuelve el motivo");
  const r2 = await save("x", ["una imagen enorme en base64 que no cabe en el almacenamiento"]);
  ok(!r2.ok && r2.motivo === "cuota", "sin IndexedDB el fallo llega a la interfaz (no se finge guardado)");

  if (fallos) { console.log(`${fallos} prueba(s) fallaron`); process.exit(1); }
})();
