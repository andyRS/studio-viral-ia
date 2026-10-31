import assert from "node:assert/strict";
import { reorderShots } from "../src/components/studio/shotOrder";
const shots = [{ id: "a", imagen: "media-a" }, { id: "b", imagen: "media-b" }, { id: "c", imagen: "media-c" }];
let checks = 0;
function ok(condition: boolean, title: string) { assert.ok(condition, title); checks++; console.log(`ok · ${title}`); }
const result = reorderShots(shots, "a", "c");
ok(result.moved && result.items.map(x => x.id).join() === "b,c,a", "arrastrar mueve al destino exacto");
ok(shots.map(x => x.id).join() === "a,b,c", "el orden original no se muta antes de guardar");
ok(result.items[2] === shots[0] && result.items[2].imagen === "media-a", "los medios conservan su asociación por id");
ok(reorderShots(shots, "c", "a").items.map(x => x.id).join() === "c,a,b", "mover hacia atrás conserva el orden intermedio");
ok(!reorderShots(shots, "missing", "a").moved, "se ignoran ids de otro storyboard");
ok(reorderShots(shots, "a", "a").items === shots, "mismo destino no provoca guardados");
ok(!reorderShots([{ id: "a", locked: true }, { id: "b" }], "a", "b").moved, "no se mueve una toma bloqueada");
ok(!reorderShots([{ id: "a" }, { id: "b", locked: true }, { id: "c" }], "a", "c").moved, "no se atraviesa una toma bloqueada");
console.log(`${checks} comprobaciones del estudio correctas.`);
