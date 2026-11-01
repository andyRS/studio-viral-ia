// Cola de operaciones de los directores. Cada operación se calcula sobre el ÚLTIMO estado guardado (no sobre
// la copia del render en que se pidió) y se guarda antes de empezar la siguiente. Así dos ediciones seguidas
// con conexión lenta no se pisan, y otros caminos de guardado que pasan por la misma cola tampoco.
export type Resultado<T, M> = { valor: T; meta?: M } | null;

export function crearCola<T, M = undefined>(guardar: (valor: T, meta: M | undefined, anterior: T) => Promise<T | void>) {
  let actual: T | undefined;
  let cadena: Promise<unknown> = Promise.resolve();
  let pendientes = 0;
  return {
    /** Adopta el estado que llega por props, solo si no hay operaciones en curso (si las hay, su resultado manda). */
    sincronizar(v: T) { if (pendientes === 0) actual = v; },
    get pendientes() { return pendientes; },
    get actual() { return actual; },
    aplicar(fn: (base: T) => Resultado<T, M>): Promise<T | null> {
      pendientes++;
      const r = cadena.then(async () => {
        const base = actual as T;
        const res = fn(base);
        if (!res) return null;
        const guardado = await guardar(res.valor, res.meta, base);
        actual = (guardado ?? res.valor) as T;
        return actual;
      }).finally(() => { pendientes--; });
      cadena = r.catch(() => {});
      return r;
    },
  };
}

// Contrato de guardado de los paneles del proyecto largo: reciben una OPERACIÓN sobre el proyecto actual
// (no un proyecto ya calculado con props de un render anterior). Devolver null = no hay nada que guardar.
export type GuardarProyecto<T> = (cambio: (base: T) => T | null) => Promise<void>;
