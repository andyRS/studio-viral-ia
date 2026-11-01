// Cinematic Action Director: planificación de secuencias de acción antes de generar nada.
// Se apoya en el director existente (importacion.ts: presencia, beats, dirección por escena) y en tiempos.ts;
// no los sustituye. Produce, por escena narrativa, una TOMA de producción planificada (una toma por escena:
// nunca se dividen ni se reordenan escenas sin aprobación; si una acción no cabe se PROPONE dividirla).
//
//   secuencia  → objetivo, conflicto, participantes, lugar, progresión de ventaja, máxima tensión, consecuencia
//   bloqueo    → posición 2D de cada personaje (x: izquierda→derecha de pantalla, y: suelo→altura), mirada,
//                desplazamiento, arma, eje de acción y lado de cámara (regla de 180°)
//   coreografía→ preparación, acción, consecuencia, reacción, transición (repartidas entre tomas)
//   cámara     → plano elegido por su función dramática, con el porqué
//   VFX        → cada efecto con su propósito narrativo
// Todo es una propuesta: se aplica al episodio solo con aprobación (por secuencia o por toma).
import { norm } from "./cast";
import { asignarPresencia, bibliotecaDesdeElenco, pesoMomento, type BibliotecaNormalizada, type ClipOriginal } from "./importacion";
import { PERFILES_BASE, type PerfilModelo } from "./tomas";

export type Fase = "preparacion" | "accion" | "consecuencia" | "reaccion" | "transicion";
export type TipoAccion = "confrontacion-sobrenatural" | "combate" | "entrada-heroica" | "manifestacion-celestial" | "persecucion" | "rescate" | "enfrentamiento-grupal" | "catastrofe" | "accion-fisica" | "amenaza";
export type Direccion2D = "izquierda" | "derecha" | "arriba" | "abajo" | "camara" | "quieto";
export type EstadoPersonaje = { nombre: string; x: number; y: number; mira: Direccion2D; desplaza: Direccion2D; postura: string; arma: string; efectos: string[]; luz: string; movimiento: "inicia" | "en curso" | "termina" | "ninguno" };
export type PlanCamara = { plano: string; movimiento: string; lado: "frente" | "contracampo"; razon: string };
export type Vfx = { efecto: string; proposito: string };
export type TomaAccion = {
  escena: number; secuencia: string; tipo: TipoAccion; fase: Fase; funcion: string;
  visibles: string[]; inicial: EstadoPersonaje[]; final: EstadoPersonaje[]; eje: [string, string] | null;
  accionPrincipal: string; consecuencia: string; camara: PlanCamara; vfx: Vfx[];
  bloqueo: string; estadoInicial: string; estadoFinal: string; continuidad: string[];
  dividir?: string;           // propuesta (no aplicada) si la acción no cabe en un clip
};
export type Secuencia = {
  id: string; titulo: string; tipo: TipoAccion; escenas: number[]; intercaladas: number[];
  objetivo: string; conflicto: string; participantes: string[]; aliados: string[]; oposicion: string[]; lugar: string;
  estadoInicial: string; progresion: { escena: number; ventaja: "oposicion" | "aliados" | "equilibrio"; evento: string }[];
  maximaTension: number; consecuencia: string; estadoFinal: string; interpretacion: string; confianza: "alta" | "media" | "baja";
};
export type PlanAccion = { secuencias: Secuencia[]; tomas: TomaAccion[]; avisos: string[]; motor: string };

// Rol de oposición: quien ES la resistencia (no quien habla de ella: «explica la resistencia» no cuenta).
const ANTAGONISTA = /(antagonista|enemig|villan|invasor|depredador|cazador|\bse opone|\bresiste\b|\bbloquea|\bamenaza a\b)/;
const ACCION_FISICA = /\b(corre|huye|persigue|golpea|dispara|salta|rescata|explota|derrumba|choca|lucha|pelea|ataca|esquiva|cae|vuela|escapa|atrapa)\w*/;
const ARMAS = /(espada|lanza|cetro|arco|escudo|daga|hacha|baston|bastón|rifle|pistola|laser|láser|látigo|latigo)/gi;
const r2 = (x: number) => Math.round(x * 100) / 100;
const lado = (x: number) => (x < 0.5 ? "izquierda" : "derecha");

// ---------- 2.1 Reconocimiento ----------
function senalesAccion(c: ClipOriginal, visibles: string[], b: BibliotecaNormalizada, enPantalla = "") {
  const { beat, peso } = pesoMomento(c, visibles);
  const ficha = (n: string) => b.personajes.find(p => norm(p.name) === norm(n));
  const opos = visibles.filter(n => ANTAGONISTA.test(norm(ficha(n)?.role)));
  const restringido = visibles.some(n => ficha(n)?.soloEnApariciones);
  // Acción física: la que se ve (narración y acción de vídeo), no la que un personaje menciona al hablar.
  const fisica = ACCION_FISICA.test(norm(`${/^narrador/i.test(c.speaker) ? c.line : ""} ${enPantalla}`));
  let tipo: TipoAccion | null = null;
  if (beat === "llegada") tipo = "entrada-heroica";
  else if (beat === "confrontacion" || beat === "ayuda") tipo = opos.length || /sobrenatural|celest|espirit|angel/.test(norm(visibles.map(n => ficha(n)?.role).join(" "))) ? "confrontacion-sobrenatural" : "combate";
  else if (beat === "vision") tipo = "manifestacion-celestial";
  else if (beat === "anticipacion" && restringido) tipo = "amenaza";
  else if (beat === "mision") tipo = "accion-fisica";
  else if (fisica && !["debilidad", "consuelo", "revelacion", "oracion"].includes(beat)) {
    const t = norm(`${c.line} ${enPantalla}`);
    tipo = /persigue|huye|escapa/.test(t) ? "persecucion" : /rescata|atrapa/.test(t) ? "rescate" : /golpea|lucha|pelea|ataca|dispara/.test(t) ? "combate" : "accion-fisica";
  }
  return { tipo, beat, peso, opos, restringido };
}

// ---------- 2.2 Secuencias ----------
export function planificarAccion(escenas: any[], cast: any[], opciones: { motor?: string } = {}): PlanAccion {
  const motor: PerfilModelo = PERFILES_BASE.find(p => p.id === (opciones.motor || "seedance")) || PERFILES_BASE[0];
  const b = bibliotecaDesdeElenco(cast);
  const clips: ClipOriginal[] = escenas.map((s, i) => ({ n: Number(s.n) || i + 1, speaker: String(s.speaker), line: String(s.line) }));
  const presencia = asignarPresencia(clips, b, cast);
  const vis = (i: number): string[] => escenas[i].visibleCharacters || escenas[i].characters || presencia[i].visibles;
  const senal = clips.map((c, i) => senalesAccion(c, vis(i), b, String(escenas[i].videoAction || "")));
  const ficha = (n: string) => b.personajes.find(p => norm(p.name) === norm(n));
  const esOpos = (n: string) => ANTAGONISTA.test(norm(ficha(n)?.role));
  const avisos: string[] = [];

  // Agrupar: escenas de acción seguidas (con hasta 3 escenas intercaladas) que comparten participantes.
  // Un personaje restringido a la anticipación forma su propia secuencia (no entra en el combate anterior).
  const grupos: { idx: number[]; inter: number[] }[] = [];
  clips.forEach((_, i) => {
    if (!senal[i].tipo) return;
    const g = grupos[grupos.length - 1];
    const ultimo = g ? g.idx[g.idx.length - 1] : -99;
    const enGrupo = g ? new Set(g.idx.flatMap(vis)) : new Set<string>();
    const comparte = vis(i).some(n => enGrupo.has(n));
    const separado = senal[i].restringido || senal[i].tipo === "manifestacion-celestial" || (g && (senal[g.idx[0]].tipo === "manifestacion-celestial" || senal[g.idx[0]].restringido));
    if (g && i - ultimo <= 4 && comparte && !separado) { for (let k = ultimo + 1; k < i; k++) g.inter.push(k); g.idx.push(i); }
    // Una oposición nueva contra el grupo, o una llegada/ayuda/avance que entra en un conflicto en curso, se suma.
    else if (g && i - ultimo <= 4 && !separado && (senal[i].opos.length || (["llegada", "ayuda", "mision", "confrontacion"].includes(senal[i].beat) && g.idx.some(j => senal[j].opos.length)))) { for (let k = ultimo + 1; k < i; k++) g.inter.push(k); g.idx.push(i); }
    else grupos.push({ idx: [i], inter: [] });
  });

  const secuencias: Secuencia[] = [];
  const tomas: TomaAccion[] = [];
  grupos.forEach((g, gi) => {
    const participantes = Array.from(new Set(g.idx.flatMap(vis)));
    const oposicion = participantes.filter(esOpos), aliados = participantes.filter(n => !esOpos(n));
    const tipo = senal[g.idx.find(i => senal[i].tipo === "confrontacion-sobrenatural") ?? g.idx[0]].tipo!;
    const lugar = (escenas[g.idx[0]].location || ficha(oposicion[0] || participantes[0])?.ambiente || "").split(/[;.]/)[0].trim();
    const pesoMax = g.idx.reduce((m, i) => (senal[i].peso > senal[m].peso ? i : m), g.idx[0]);
    const llegadas = g.idx.filter(i => senal[i].beat === "llegada");
    const progresion = g.idx.map(i => {
      const tras = llegadas.length && i > llegadas[0];
      const ventaja: "oposicion" | "aliados" | "equilibrio" = senal[i].beat === "llegada" ? "equilibrio" : tras ? (senal[i].beat === "ayuda" ? "aliados" : "equilibrio") : senal[i].opos.length || senal[i].beat === "mision" ? "oposicion" : "equilibrio";
      return { escena: clips[i].n, ventaja, evento: escenas[i].title || senal[i].beat };
    });
    const unica = tipo === "manifestacion-celestial" || tipo === "amenaza";   // por naturaleza, una sola toma
    const confianza: Secuencia["confianza"] = oposicion.length && g.idx.length >= 3 ? "alta" : g.idx.length >= 2 || unica ? "media" : "baja";
    const ultimaVentaja = progresion[progresion.length - 1].ventaja;
    const id = `S${gi + 1}`;
    const titulo = tipo === "amenaza" ? `Anticipación: ${participantes.join(", ")}` : tipo === "manifestacion-celestial" ? `Manifestación: ${participantes.join(" y ")}` : oposicion.length ? `${aliados.join(" y ") || "Los protagonistas"} contra ${oposicion.join(" y ")}` : `Acción: ${participantes.join(", ")}`;
    const sec: Secuencia = {
      id, titulo, tipo, escenas: g.idx.map(i => clips[i].n), intercaladas: g.inter.map(i => clips[i].n),
      objetivo: oposicion.length ? `${aliados[0] || "El protagonista"} debe superar la resistencia de ${oposicion.join(" y ")}` : tipo === "amenaza" ? "Anunciar una amenaza futura sin resolverla" : `Mostrar ${participantes.join(" y ")} en su momento de mayor impacto`,
      conflicto: oposicion.length ? `${oposicion.join(" y ")} bloquea el avance de ${aliados.filter(a => !llegadas.some(i => vis(i).includes(a))).join(" y ") || aliados.join(" y ")}` : (escenas[g.idx[0]].conflict || ""),
      participantes, aliados, oposicion, lugar,
      estadoInicial: oposicion.length ? `${oposicion.join(" y ")} domina el espacio; ${aliados[0] || "los protagonistas"} aún no puede avanzar` : "Calma previa a la manifestación",
      progresion, maximaTension: clips[pesoMax].n,
      consecuencia: ultimaVentaja === "aliados" ? `${aliados.join(" y ")} abren paso, pero la oposición persiste` : ultimaVentaja === "oposicion" ? "La resistencia se mantiene" : "La situación queda abierta",
      estadoFinal: ultimaVentaja === "aliados" ? "El avance continúa sin victoria definitiva; se anticipa otro conflicto" : tipo === "amenaza" ? "La amenaza queda anunciada para más adelante" : "Sin resolución definitiva",
      interpretacion: g.inter.length ? `Interpretación propuesta: las escenas ${g.inter.map(i => clips[i].n).join(", ")} se intercalan (montaje paralelo) dentro de esta secuencia. Revísalo.` : "",
      confianza,
    };
    if (confianza === "baja") avisos.push(`${titulo}: poca información para planificar una coreografía (una sola escena); se propone una interpretación sencilla. Revísala.`);
    secuencias.push(sec);

    // ---------- 3. Bloqueo y continuidad de estado ----------
    // Escenario 2D: aliados a la izquierda avanzando hacia la derecha; oposición a la derecha mirando a la izquierda.
    // La altura (y) refleja el nivel del escenario (fortaleza alta, cielo, suelo).
    const altoOpos = /fortaleza|trono|torre|altura|monta|muralla/.test(norm(lugar + " " + oposicion.map(o => ficha(o)?.ambiente).join(" "))) ? 0.72 : 0.5;
    const estado = new Map<string, EstadoPersonaje>();
    // Armas y objetos de la ficha (apariencia y vestuario): forman parte de la identidad y se mantienen en cada toma.
    const armaDe = (n: string) => Array.from(new Set(`${ficha(n)?.descripcion || ""} ${cast.find((c: any) => norm(c.name) === norm(n))?.clothing || ""}`.match(ARMAS) || [])).map(x => x.toLowerCase()).filter(x => !/^arma/.test(x)).join(", ");
    // Sin oposición (una manifestación, un diálogo): la figura contemplada (personaje sin diálogo) a la derecha
    // mirando a la izquierda y quien la contempla a la izquierda: enfrentados, sin cruzar el eje.
    // Una amenaza anticipada (personaje restringido) ocupa también el lado de la oposición.
    const figura = !oposicion.length ? participantes.find(n => /sin_dialogo|sin dialogo/.test(norm(ficha(n)?.tipo)) || ficha(n)?.soloEnApariciones) : undefined;
    participantes.forEach(n => {
      const op = esOpos(n) || n === figura, k = op ? (oposicion.includes(n) ? oposicion.indexOf(n) : 0) : aliados.filter(a => a !== figura).indexOf(n);
      estado.set(n, { nombre: n, x: op ? r2(0.8 - k * 0.08) : r2(0.18 + k * 0.08), y: op && !figura ? altoOpos : 0.45, mira: op ? "izquierda" : "derecha", desplaza: "quieto", postura: "en guardia", arma: armaDe(n), efectos: [], luz: op ? "sombra y relámpagos" : "luz blanca y dorada contenida", movimiento: "ninguno" });
    });
    const eje: [string, string] | null = aliados.length && oposicion.length ? [aliados[0], oposicion[0]] : figura && participantes.length > 1 ? [participantes.find(n => n !== figura)!, figura] : null;
    g.idx.forEach((i, k) => {
      const c = clips[i], s = escenas[i], v = vis(i), sg = senal[i];
      const copia = (n: string) => ({ ...estado.get(n)!, efectos: [...estado.get(n)!.efectos] });
      // Quien llega entra desde arriba (entre las nubes / fuera de cuadro): ese es su estado inicial.
      if (sg.beat === "llegada") for (const a of v.filter(n => !esOpos(n))) { const e = estado.get(a)!; estado.set(a, { ...e, x: 0.4, y: 0.95, desplaza: "abajo", postura: "aparece a contraluz entre las nubes", movimiento: "inicia", efectos: ["apertura de nubes", "haz volumétrico"] }); }
      const inicial = v.filter(n => estado.has(n)).map(copia);
      // Coreografía: fase según el lugar en la secuencia y el tipo de momento.
      const prev = k > 0 ? senal[g.idx[k - 1]].beat : null;
      const fase: Fase = sg.beat === "llegada" ? "preparacion" : k === 0 ? "preparacion" : sg.beat === "ayuda" && k === g.idx.length - 1 ? "transicion"
        : sg.beat === "ayuda" ? "accion" : prev === "ayuda" || prev === "llegada" ? (sg.opos.length ? "reaccion" : "consecuencia") : sg.beat === "confrontacion" && k > 0 ? "accion" : "accion";
      const A = v.find(n => norm(n) === norm(c.speaker)) || v[0];
      const otro = v.find(n => n !== A);
      const mover = (n: string, dx: number, dy: number, desplaza: Direccion2D, postura: string, mov: EstadoPersonaje["movimiento"], efectos?: string[]) => {
        const e = estado.get(n); if (!e) return;
        estado.set(n, { ...e, x: r2(Math.min(0.95, Math.max(0.05, e.x + dx))), y: r2(Math.min(0.98, Math.max(0.05, e.y + dy))), desplaza, postura, movimiento: mov, efectos: efectos ?? e.efectos });
      };
      let accionPrincipal = s.videoAction || "", consecuencia = "";
      switch (sg.beat) {
        case "confrontacion":
          for (const o of v.filter(esOpos)) mover(o, k > 0 && fase === "reaccion" ? 0.04 : 0, 0, fase === "reaccion" ? "derecha" : "quieto", fase === "reaccion" ? "retrocede un paso y empuja contra la luz" : k === 0 ? "imponente, de pie" : "brazo extendido sosteniendo la barrera", fase === "reaccion" ? "en curso" : "inicia", ["barrera de sombra"]);
          consecuencia = fase === "reaccion" ? "La barrera de sombra se agrieta, pero no cae" : "El paso queda bloqueado";
          break;
        case "mision":
          for (const a of v.filter(n => !esOpos(n))) mover(a, k === 0 ? 0.04 : 0.02, k === 0 ? -0.05 : 0, "derecha", k === 0 ? "desciende con firmeza" : "empuja contra la resistencia", k === 0 ? "inicia" : "en curso");
          consecuencia = k === 0 ? "La misión queda en marcha hacia la derecha del encuadre" : "El avance se frena contra la barrera";
          break;
        case "llegada":
          for (const a of v.filter(n => !esOpos(n))) mover(a, 0.05, -0.2, "abajo", "desciende y se revela del todo, de frente a la oposición", "termina");
          consecuencia = "La llegada cambia la escala del conflicto: la sombra retrocede";
          break;
        case "ayuda": {
          const ayudante = A && !esOpos(A) ? A : v.find(n => !esOpos(n));
          const ayudado = v.find(n => n !== ayudante && !esOpos(n));
          if (ayudante) mover(ayudante, ayudado ? 0.55 - (estado.get(ayudante)?.x || 0.4) : 0, 0, "derecha", "se interpone entre la sombra y su aliado", "en curso", ["luz que contiene la sombra"]);
          if (ayudado) mover(ayudado, fase === "transicion" ? 0.3 : 0.08, -0.12, "derecha", fase === "transicion" ? "cruza el paso abierto" : "ve abrirse el paso", fase === "transicion" ? "termina" : "inicia");
          consecuencia = fase === "transicion" ? `${ayudado || "El aliado"} sigue su camino; la oposición no ha caído` : `Se abre un paso para ${ayudado || "el aliado"}`;
          break;
        }
        case "vision": consecuencia = "La visión deja sin fuerzas a quien la contempla"; break;
        case "anticipacion": consecuencia = "La amenaza queda anunciada, sin enfrentamiento"; break;
        default: consecuencia = s.conflict || "";
      }
      const final = v.filter(n => estado.has(n)).map(n => ({ ...estado.get(n)! }));
      // ---------- 5. Cámara por función dramática ----------
      const primero = k === 0;
      const camara: PlanCamara = sg.beat === "llegada" ? { plano: "Plano general monumental en contrapicado", movimiento: "Grúa descendente desde las nubes hasta el contrapicado.", lado: "frente", razon: "La grúa revela la escala monumental y el contrapicado refuerza la autoridad de quien llega." }
        : primero && sg.opos.length ? { plano: "Gran plano general de situación en contrapicado", movimiento: "Grúa ascendente lenta.", lado: "frente", razon: "Primera toma de la secuencia: presenta la geografía y la escala del dominio de la oposición; el contrapicado comunica amenaza." }
        : primero ? { plano: "Gran plano general de situación", movimiento: "Grúa descendente de plano general a plano medio.", lado: "frente", razon: "Primera toma de la secuencia: sitúa al personaje y la dirección de su objetivo." }
        : fase === "reaccion" ? { plano: "Primer plano en contrapicado", movimiento: "Empuje lento hacia el rostro.", lado: "frente", razon: "Reacción: el primer plano muestra cómo la intervención afecta a la oposición." }
        : sg.beat === "ayuda" && otro && fase !== "transicion" ? { plano: "Plano a dos sobre el hombro", movimiento: "Travelling lateral de izquierda a derecha.", lado: "frente", razon: "Relaciona a los dos aliados frente a la oposición y conserva la dirección de avance (izquierda→derecha)." }
        : sg.beat === "ayuda" || sg.beat === "mision" ? { plano: "Plano general en movimiento", movimiento: "Travelling lateral de izquierda a derecha siguiendo el avance.", lado: "frente", razon: "El travelling acompaña el desplazamiento en la misma dirección de pantalla que el resto de la secuencia." }
        : sg.beat === "vision" ? { plano: "Plano general a ras del agua", movimiento: "Dolly lento hacia la figura.", lado: "frente", razon: "El dolly-in intensifica el descubrimiento de la visión." }
        : sg.beat === "anticipacion" ? { plano: "Plano medio en contrapicado", movimiento: "Dolly lento hacia el rostro.", lado: "frente", razon: "Contrapicado y acercamiento: presentan una amenaza futura sin acción ni contacto." }
        : { plano: s.shotType || "Plano medio", movimiento: s.camera || "Dolly lento de acercamiento.", lado: "frente", razon: "Se mantiene la propuesta del director: no hay un cambio de función que pida otro plano." };
      if (/orbit|órbita|orbita/.test(norm(camara.movimiento)) && !/orbit/.test(norm(motor.camara))) camara.movimiento = "Arco lento alrededor del personaje.";
      // ---------- 6. VFX con propósito ----------
      const vfx: Vfx[] = sg.beat === "llegada" ? [{ efecto: "Apertura de nubes en vórtice", proposito: "Marca el momento exacto de la llegada" }, { efecto: "Haces volumétricos blancos y dorados", proposito: "Revela la figura de silueta a rostro" }, { efecto: "Onda de luz que empuja la sombra", proposito: "Hace visible el cambio de ventaja" }]
        : sg.beat === "confrontacion" ? [{ efecto: fase === "reaccion" ? "Grieta de luz en la barrera de sombra" : "Barrera de sombra entre nubes", proposito: fase === "reaccion" ? "Muestra que la resistencia empieza a ceder sin caer" : "Hace visible el bloqueo" }, { efecto: "Relámpagos lejanos", proposito: "Sostiene la tensión del dominio" }]
        : sg.beat === "ayuda" ? [{ efecto: "Corredor de luz", proposito: "Señala el paso que se abre" }, { efecto: "Choque de luz y sombra con desplazamiento de aire", proposito: "Hace sentir la fuerza que contiene la resistencia" }]
        : sg.beat === "mision" ? [{ efecto: k === 0 ? "Partículas de luz suspendidas" : "Viento de sombra contra el personaje", proposito: k === 0 ? "Acompaña el descenso con calma" : "Hace visible la resistencia que frena el avance" }]
        : sg.beat === "vision" ? [{ efecto: "Resplandor y destellos como relámpago sobre el agua", proposito: "Traduce los rasgos luminosos de la figura (su ficha) sin añadir elementos" }]
        : sg.beat === "anticipacion" ? [{ efecto: "Niebla fría y relámpagos lejanos", proposito: "Anuncia la amenaza sin mostrar combate" }] : [];
      // Texto de bloqueo (para el prompt de imagen) y estados inicial y final (imagen / vídeo).
      const describe = (e: EstadoPersonaje) => `${e.nombre} ${lado(e.x)} del encuadre${e.y > 0.7 ? ", en lo alto" : e.y < 0.35 ? ", abajo" : ""}, mirando a la ${e.mira === "izquierda" || e.mira === "derecha" ? e.mira : "cámara"}${e.arma ? `, con ${e.arma}` : ""}`;
      const bloqueo = inicial.length ? `${inicial.map(describe).join("; ")}${eje && v.includes(eje[0]) && v.includes(eje[1]) ? `; eje de acción entre ${eje[0]} (izquierda) y ${eje[1]} (derecha): la cámara no lo cruza` : ""}` : "";
      const estadoInicial = inicial.map(e => `${e.nombre}: ${e.postura}`).join("; ");
      const estadoFinal = final.map(e => `${e.nombre}: ${e.postura}${e.desplaza === "izquierda" || e.desplaza === "derecha" ? `, avanzando hacia la ${e.desplaza}` : e.desplaza === "abajo" && !/desciende/.test(e.postura) ? ", descendiendo" : e.desplaza === "arriba" ? ", ascendiendo" : ""}`).join("; ");
      const seg = Number(s.tomaSeg) || Number((String(s.animationPrompt || "").match(/(\d+)\s*(?:seconds|segundos)/) || [])[1]) || 5;
      const dividir = sg.peso >= 0.95 && seg < 8 ? `La ${sg.beat === "llegada" ? "llegada" : "acción"} necesita más tiempo del que da una toma de ${seg} s: propuesta (no aplicada) de generarla a 8 s o dividirla en dos tomas (revelación de la silueta · rostro y descenso).` : undefined;
      tomas.push({ escena: c.n, secuencia: id, tipo: sg.tipo || tipo, fase, funcion: escenas[i].goal || "", visibles: v, inicial, final, eje, accionPrincipal, consecuencia, camara, vfx, bloqueo, estadoInicial, estadoFinal, continuidad: [], ...(dividir ? { dividir } : {}) });
    });
  });
  verificarContinuidad(secuencias, tomas);
  return { secuencias, tomas, avisos, motor: motor.nombre };
}

// Continuidad entre tomas de una misma secuencia: lado de pantalla, posiciones relativas y eje de cámara.
// Se puede volver a ejecutar tras editar una toma.
export function verificarContinuidad(secuencias: Secuencia[], tomas: TomaAccion[]) {
  for (const t of tomas) t.continuidad = [];
  for (const sec of secuencias) {
    const ts = tomas.filter(t => t.secuencia === sec.id);
    ts.forEach((t, k) => {
      const ant = ts[k - 1]; if (!ant) return;
      for (const e of t.inicial) { const e0 = ant.final.find(x => x.nombre === e.nombre); if (e0 && lado(e0.x) !== lado(e.x)) t.continuidad.push(`${e.nombre} cambia de lado de pantalla sin transición.`); }
      const pares = (x: TomaAccion) => x.final.flatMap(a => x.final.filter(bb => bb.nombre > a.nombre).map(bb => [a.nombre, bb.nombre, Math.sign(a.x - bb.x)] as const));
      for (const [a, bb, sgn] of pares(ant)) { const ea = t.inicial.find(x => x.nombre === a), eb = t.inicial.find(x => x.nombre === bb); if (ea && eb && Math.sign(ea.x - eb.x) !== sgn && sgn !== 0) t.continuidad.push(`${a} y ${bb} invierten sus posiciones respecto a la toma anterior.`); }
      if (ant.camara.lado !== t.camara.lado) t.continuidad.push("La cámara cruza el eje de acción respecto a la toma anterior.");
      if (!t.continuidad.length) t.continuidad.push("Continuidad correcta: mismas posiciones relativas, eje y dirección de pantalla que la toma anterior.");
    });
    if (ts[0]) ts[0].continuidad.push("Primera toma de la secuencia: establece posiciones y eje.");
  }
  return tomas;
}

// Campos que la aprobación escribe en cada escena (los usan los prompts de imagen y vídeo de production.ts).
export function camposDeToma(t: TomaAccion) {
  return {
    blocking: t.bloqueo, startState: t.estadoInicial, endState: t.estadoFinal, shotType: t.camara.plano, camera: t.camara.movimiento, cameraReason: t.camara.razon,
    actionPhase: t.fase, actionSequence: t.secuencia, vfx: t.vfx.map(v => v.efecto).join(", "), vfxPurpose: t.vfx.map(v => `${v.efecto}: ${v.proposito}`).join(" · "),
  };
}
export function aplicarAccion(out: any, plan: PlanAccion, aprobadas: number[], ediciones: Record<number, Partial<{ shotType: string; camera: string; videoAction: string }>> = {}) {
  const porN = new Map(plan.tomas.map(t => [t.escena, t]));
  const scenes = (out?.scenes || []).map((s: any, i: number) => {
    const n = Number(s.n) || i + 1; const t = porN.get(n);
    if (!t || !aprobadas.includes(n)) return s;
    return { ...s, ...camposDeToma(t), ...(ediciones[n] || {}) };
  });
  return { ...out, scenes, accionDirector: { at: new Date().toISOString(), secuencias: plan.secuencias.map(x => ({ id: x.id, titulo: x.titulo, escenas: x.escenas })), aprobadas } };
}

// Coste: solo con tarifas configuradas (nunca inventadas).
export function costeEstimado(segundos: number, tarifa: { creditosSegundo: number | null; usdCredito: number | null; reintentos: number }) {
  if (tarifa.creditosSegundo == null) return { creditos: null, usd: null, nota: "Sin tarifa configurada: introduce los créditos por segundo de tu plan." };
  const creditos = Math.round(segundos * tarifa.creditosSegundo * (tarifa.reintentos || 1));
  return { creditos, usd: tarifa.usdCredito == null ? null : Math.round(creditos * tarifa.usdCredito * 100) / 100, nota: `${segundos} s × ${tarifa.creditosSegundo} créditos/s × ${tarifa.reintentos || 1} intentos` };
}
