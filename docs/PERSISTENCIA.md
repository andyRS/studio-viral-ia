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

## Pendiente (necesita diseño o un contrato nuevo)

- Arrastrar escenas y tomas: usar los handlers de orden existentes (`mover` en `TomasPanel`). Las escenas cortas dependen del índice para archivos y `clipChecks`.
- Etapas reales de generación: hoy las rutas devuelven la respuesta completa. Hace falta un contrato de trabajos (job id, estados, cancelación) antes de mostrar porcentajes.
- Borradores entre módulos y archivos de trabajo persistentes: requieren definir almacenamiento de medios (Supabase Storage con políticas por usuario) y una clave de borrador por módulo.


## Integración con la presentación cinematográfica

`PersistenceNotice` está montado en el dashboard para hacer visibles fallos y conflictos en escritorio y móvil. Usa `falloGuardado`, `conflictos`, `resolverConflicto` y `descargarRespaldo` sin cambiar la capa de datos. SessionBar sigue mostrando el indicador resumido. El nuevo diseño mantiene el aviso «Reintentar guardado» y la importación manual de proyectos largos. Véase `UX-RENOVACION.md` para el alcance visual.
