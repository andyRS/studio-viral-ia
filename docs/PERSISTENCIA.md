# Persistencia: contrato para la interfaz

Capa de datos (`src/lib/DataContext.tsx`, `src/lib/store.ts`, `src/lib/persistencia.ts`, `src/lib/creacion.ts`).
Lo que la interfaz puede usar y lo que significa cada estado.

## `useData()`: lo nuevo

| Campo | Qué es | Cómo mostrarlo |
|---|---|---|
| `falloGuardado` | El último guardado **en el navegador** falló (cuota llena o almacenamiento bloqueado). Lo que hay en pantalla NO está guardado. `null` si todo está bien. | Aviso persistente y botón «Descargar copia» (`descargarRespaldo()`). `SessionBar` ya lo muestra. |
| `descargarRespaldo()` | Descarga un JSON con todo el estado en pantalla. | Junto a cualquier aviso de fallo o conflicto. |
| `conflictos` | Cambios propios que chocaron con otra ventana o dispositivo (misma columna, otro valor). En pantalla queda la versión del servidor. | Lista con columnas afectadas y dos acciones: `resolverConflicto(id, "mio")` reaplica el cambio propio; `"servidor"` lo descarta. |
| `update()` | Envía **solo las columnas que cambian**, en cola por registro (dos `update` seguidos del mismo registro no se pisan). Con la migración `20261104_revisiones.sql`, si otra ventana guardó antes: combina el cambio si son columnas distintas; si es la misma, lanza `ConflictoError`. | Capturar `ConflictoError` (exportado) y no mostrarlo como un error genérico. |
| `isUnavailable(c)` | La tabla existe pero no respondió al cargar (red, tiempo, permisos, servicio caído). Las escrituras en ella fallan con un mensaje claro en vez de quedar en el navegador. | «No se pudo leer; recarga antes de editar». **No** es «falta migración». |
| `isLocalOnly(c)` | Sin sesión, o tabla opcional que no existe todavía (migración pendiente). Con sesión, la copia local es **de ese usuario** (`u:<userId>:<clave>`). | Texto distinto según `mode`. |
| `importables()` / `importarLocal(c)` / `descartarImportable(c)` | Copias del navegador sin dueño (modo sin sesión o versiones anteriores). Nunca se mezclan solas: solo se importan si el usuario lo pide. | Aviso «Hay N … en este navegador · Importar a mi cuenta · No, gracias». Ejemplo en `StoryArchitect`. |

## Almacenamiento local (`store.ts`)

- `save(clave, valor)` devuelve `{ ok, donde: "local" | "indexeddb", motivo?, mensaje? }`. Si localStorage no cabe, se guarda en IndexedDB y se recupera al abrir. Solo si ambos fallan, `ok` es `false`.
- `saveSync` para valores pequeños que deben quedar antes de seguir (p. ej. la creación apartada).

## Errores de Supabase (`persistencia.ts`)

`clasificarError(err)` → `tabla_ausente | columna_ausente | tiempo | permiso | red | servicio | otro`.
Solo `tabla_ausente` activa el respaldo local de una tabla opcional; el resto se informa con `explicarError()`.

## Creación de historias (`creacion.ts`)

La IA genera serie, elenco y episodio, y la app los guarda en varios pasos. Antes de guardar, lo generado se aparta en el navegador (`creacion-pendiente`, por usuario).

Cada paso terminado queda anotado. Si uno falla, `GeneratorModule` muestra «Reintentar guardado». El reintento sigue desde el paso que falló, sin volver a generar y sin duplicar la serie ni los personajes.

## Archivos de trabajo (`archivosTrabajo.ts`)

Los clips e imágenes de la mesa de escenas se guardan en el navegador (IndexedDB), por usuario y episodio. Se recuperan al recargar, se borran solos a los 30 días sin abrir el episodio y hay un botón «Liberar espacio de este episodio». No es la nube: otro navegador u otro dispositivo no los ve. Si no caben, la mesa avisa de que ese archivo queda solo en la sesión.

## Borradores y «Retomar» (`borradores.ts`)

- `useBorrador(clave, inicial)` funciona como `useState`, pero guarda el valor (por usuario, 14 días) y lo restaura al volver al módulo o al recargar. Devuelve `{ restaurado, limpiar }`. Se usa en:
  - la premisa de la mesa creativa;
  - idea, notas, réplica y deseo del generador;
  - el laboratorio narrativo;
  - la entrada del calendario.
- `anotarPunto` / `leerUltimoPunto`: episodio, serie y pestaña de la última edición. «Retomar donde lo dejé» de MissionControl abre ese episodio en esa pestaña, si sigue existiendo.

## Generación observable (`api-client.ts`)

- Las rutas devuelven la respuesta completa al final: no hay etapas reales. `GenerationStatus` muestra solo el tiempo transcurrido, y a partir de 90 s avisa del corte del servidor (180 s).
- `postApi(ruta, cuerpo, { signal })` admite cancelar (`AbortController`). Cancelar devuelve `status 499`; una conexión cortada devuelve `status 0`, con un mensaje claro en vez de una excepción.
- Cada generación de IA queda apuntada mientras dura. Si la página se recarga o se cierra antes de recibir la respuesta, `PersistenceNotice` avisa en la carga siguiente: «se interrumpió; no se guardó nada». Las pestañas vivas tienen latido, así que una generación en curso en otra pestaña no cuenta como cortada.

## Orden de escenas cortas (`ordenEscenas.ts`)

`moverEscenaCorta(out, desde, hasta)` renumera las escenas y, con ellas, todo lo que depende del número:
- el diálogo del montaje (`guionJson.clips`);
- los bloques del guion;
- las escenas elegidas para Dola.

`GeneratorModule` aplica además tres cosas:
- `remapRevisiones` (`clipChecks.clipIndex`);
- `renumerarArchivos` (archivos guardados en el navegador);
- una copia del orden anterior en `episode.versions`.

En `NarrativeDesk`, el reordenado se hace con los botones ◀ ▶ o con Alt+← / Alt+→ en la barra de escenas. No se ofrece en episodios terminados.

## Carga por módulo

`page.tsx` carga cada módulo con `next/dynamic` al abrirlo, con un estado «Abriendo el módulo…». La página inicial bajó de 354 kB a 183 kB de First Load JS. La sesión y el retorno OAuth (`?modulo=metricas`) no cambian.

## Pruebas

- `npm test`: 60 comprobaciones de lógica.
- `npm run test:e2e`: 14 flujos en el navegador, en modo sin sesión y con datos aislados:
  - crear y recuperar tras recargar;
  - almacenamiento lleno;
  - borradores;
  - calendario;
  - generación interrumpida;
  - reordenar con el teclado.
- Ambas corren en CI después del build.

## Sigue pendiente

- Archivos en la nube (otro dispositivo): Supabase Storage gratis limita a 50 MB por archivo y 1 GB en total, y hace falta definir cuánto se guarda.
- Persistir los ajustes de prompts del PromptWorkbench: falta decidir su relación con prompts derivados, revisiones y snapshots de personaje.
- Publicar en redes o reprogramar desde la app: requiere permisos de publicación de cada red (Meta: `pages_manage_posts`), que hoy la conexión no pide.
- Tipado estricto (`strict: true`): empezó con `storyOutlines: Outline[]`; el resto de los `any` se migrará por módulos.

## Integración con la presentación cinematográfica

`PersistenceNotice` está montado en el dashboard para hacer visibles fallos y conflictos en escritorio y móvil. Usa `falloGuardado`, `conflictos`, `resolverConflicto` y `descargarRespaldo` sin cambiar la capa de datos. SessionBar sigue mostrando el indicador resumido. El nuevo diseño mantiene el aviso «Reintentar guardado» y la importación manual de proyectos largos. Véase `UX-RENOVACION.md` para el alcance visual.
