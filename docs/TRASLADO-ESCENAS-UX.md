# Traslado de escenas: interacción y movimiento

Entrega de diseño sobre `fa85bdc`. Paleta petróleo, cyan/hielo y dorado. No cambia migraciones, persistencia, cola, historial ni operaciones de integridad.

## Lo integrado

- `useReorderMotion` anima las tarjetas que cambian de posición durante 240 ms (FLIP con Web Animations). Está conectado al director largo, al corto y a Tomas, incluyendo las vistas de secuencia y lectura que contienen filas de escenas.
- La animación usa el orden que ya devuelve la lógica existente; no introduce una copia optimista, un guardado ni un temporizador para simular éxito. Cancelar o fallar un movimiento no aplica una recolocación ficticia.
- En el largo y en Tomas se usan los IDs existentes. En el corto, sin IDs estables por escena, las claves son solo visuales: personaje, frase, título, lugar y número de aparición cuando se repiten. No se modifican los números, revisiones ni asociaciones de medios. Las copias con contenido idéntico pueden ser visualmente indistinguibles hasta que se editen; esto no crea una identidad nueva en los datos.
- El director corto conserva el elemento enfocado al reordenar y selecciona la posición nueva después de que la operación existente termine correctamente.
- Se respeta `prefers-reduced-motion` y la intensidad Reducidos. No se crean animaciones en ese modo; las que estuvieran activas se cancelan al cambiar la preferencia. Scroll y cambios de tamaño actualizan la geometría sin animar una navegación como si fuera un reordenado.

## Selector de destino

`SceneTransferDialog.tsx` presenta origen, secuencia de destino, ubicación antes de una escena o al final, y vista previa de inserción destacada en dorado.

- Solo ofrece secuencias del mismo acto; el origen no aparece como destino.
- Deshabilita el origen protegido y las secuencias bloqueadas o que contienen escenas bloqueadas. Esta es una restricción visual conservadora; la operación debe validar nuevamente los candados actuales al ejecutarse.
- Ofrece secuencias vacías. Si el ancla deja de existir mientras se elige el destino, bloquea la confirmación y pide elegir de nuevo.
- Usa diálogo nativo para foco contenido y Escape, y devuelve el foco al disparador al cerrar. Cancelar no escribe datos.
- Al confirmar espera la promesa, impide envíos duplicados y conserva la elección si falla. Durante la espera no permite cerrar el diálogo. No muestra un aviso de guardado remoto propio.
- Móvil: origen y destino se apilan y el contenido del diálogo se desplaza verticalmente.

**Estado de la app:** `LongDirector` muestra «Vista previa de traslado». Se puede elegir y revisar un destino, pero el botón de confirmación permanece deshabilitado y explica que el traslado todavía no está disponible. No hay un traslado ficticio ni un botón que informe éxito sin ejecutar nada.

## Contrato para el agente de desarrollo

`LongDirector` acepta una prop opcional `onTransferScene: ConfirmSceneTransfer`. Al conectarla, el disparador pasa a «Cambiar de secuencia» y se habilita la confirmación para destinos válidos.

La solicitud es:

```ts
type SceneTransferRequest = {
  sceneId: string;
  sourceSequenceId: string;
  targetSequenceId: string;
  beforeSceneId: string | null; // null: al final; usa ID, nunca un índice
};
type ConfirmSceneTransfer = (request: SceneTransferRequest) => Promise<void>;
```

La conexión debe aplicar una operación reversible al último proyecto mediante la cola y el historial existentes. Debe revalidar acto, origen, destino, ancla y candados, preservar la misma escena y sus asociaciones, y resolver solo tras guardar. Rechazar la promesa mantiene el diálogo abierto. Para que Deshacer del director incluya el traslado, conectar su ejecución a `ops.ejecutar` dentro de LongDirector; no crear un historial aparte en el callback de StoryArchitect. El contrato anterior expresa la intención de UI, no sustituye esa operación.

Después de resolver, el director conserva el ID seleccionado y enfoca su tarjeta cuando está visible. El movimiento entre actos queda fuera del alcance.

## Revisión realizada

`npm run check` pasó: tipos, lint (los seis avisos previos), 84 pruebas de lógica y compilación de producción (18 páginas, 183 kB de First Load JS en la raíz). No se añadieron dependencias. No se volvió a ejecutar la batería Playwright de 31 recorridos; la validación de esta capa visual se realizó en navegador mediante sus controles.

Pantalla temporal en memoria, con escenas ficticias de Clara, sin DataProvider, IA, Supabase ni escrituras de proyectos. Se retiró antes de compilar la entrega.

- Selector: destino y ancla, secuencia vacía, exclusión de otros actos y destino bloqueado, confirmación deshabilitada sin callback, Escape y devolución de foco.
- Con callback simulado: estado pendiente, fallo que conserva la elección y permite reintentar, emisión de `{sceneId:"s2",sourceSequenceId:"q1",targetSequenceId:"q2",beforeSceneId:"s5"}`. El simulador solo registró la solicitud: no valida una implementación de traslado.
- Director largo y corto: reordenado por Alt+flechas. Foco conservado (`ld-s2`, `sd-card-1` tras renumeración). Transformaciones intermedias observadas en navegador; en Reducidos, `transform: none` inmediatamente después de mover.
- Tomas: recolocación mediante Mover antes con transformaciones intermedias en las dos tarjetas que intercambian posición.
- Móvil 390×844: ancho de contenido del diálogo igual a su ancho útil (330 px), sin desbordamiento horizontal del diálogo.
- Sin errores de consola en la revisión. Las pruebas de Supabase, movimiento real entre secuencias y deshacer de ese movimiento quedan para la integración de datos.

Capturas con datos ficticios: [vista previa](previews/scene-transfer-preview.jpg), [móvil](previews/scene-transfer-mobile.jpg).
