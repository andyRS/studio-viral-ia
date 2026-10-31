# Creative Studio · cuatro etapas, cuatro referencias

El Inicio inteligente conserva la bienvenida, los pendientes, las métricas y el calendario aprobados. Esta renovación se aplica al interior del estudio y mantiene petróleo, hielo y dorado.

## 1. Historia y guion · panel creativo cinematográfico

`NarrativeDesk` presenta la escena seleccionada, diálogo, elenco y notas de dirección. `SceneRail` permite recorrer escenas con clic, Tab, flechas, Inicio y Fin. La misma selección se conserva al pasar del guion a los prompts de imagen o animación del episodio.

Las fotos de personajes están etiquetadas como referencias, no como fotogramas generados. La ficha narrativa, estructura y evaluación anteriores siguen accesibles en un desplegable. Los bloques de guiones antiguos y los indicadores de interacción telefónica se conservan.

## 2. Storyboard y producción · mesa de tomas con inspector

`TomasPanel` organiza cuadrícula/secuencia, duración real de clips según el perfil configurado e inspector contextual. Dirección y prompts ocupan pestañas del mismo panel. Cámara/luz/expresión y sonido/continuidad se despliegan progresivamente, manteniendo los campos y handlers de guardado existentes.

El arrastre usa Pointer Events y captura del puntero; funciona con ratón y admite punteros táctiles. Los botones Mover antes/después ofrecen alternativa por teclado. Ambos caminos llaman a `reorderShots` y al `guardar` existente. El orden se confirma solo cuando la promesa termina; el fallo conserva el flujo de avisos de persistencia. IDs y medios permanecen asociados y no se mueve ni atraviesa una toma bloqueada. Las escenas cortas no se reordenan: sus archivos y revisiones siguen asociados por índice y requieren otro contrato.

En móvil, abrir una toma lleva al inspector. No se requiere un gesto de arrastre para completar una tarea.

## 3. Prompts · foco, profundidad y comparación

`PromptWorkbench` se integra en las imágenes, animación, fichas del episodio, prompts por toma y Estudio Dola. Permite leer, ajustar una **copia temporal**, comparar con el original, restablecer, copiar, exportar .txt y activar concentración.

El ajuste no escribe en el proyecto ni cambia referencias/versiones. La interfaz explica que se pierde al salir; debe copiarse o exportarse. Una actualización del prompt original reinicia la copia para evitar comparar contra una fuente distinta. La apertura de Dola indica explícitamente cuando utiliza el original.

CopyButton comunica éxito y fallos de portapapeles; no simula un copiado si el navegador lo rechaza. Los historiales de guion existentes conservan su guardado y comparación; se mejora su presentación y las etiquetas de los campos.

## 4. Resultados y revisión · previews y acciones contextuales

El episodio tiene cabecera, navegación de etapas e inspector de producción contextual. Las fichas del elenco conservan versiones, aprobación y reglas de continuidad.

`SceneDesk` permite seleccionar una escena desde miniaturas y verla en una sala central de revisión: reproductor, referencia, diálogo, prompts, motivo de rehacer y aprobación. Se conservan carga por lote, asignación manual, último fotograma, revisiones y montaje final. Los archivos siguen siendo de sesión; no se presenta la revisión guardada como almacenamiento de vídeo.

ReferencePreview utiliza un diálogo en portal y un disparador de lectura que sigue disponible dentro de un proyecto terminado/bloqueado. Solo amplía y compara referencias; no permite modificar el proyecto desde el diálogo. Escape cierra y devuelve el foco al disparador.

## Verificación y límites

- 55 comprobaciones: 47 anteriores y 8 nuevas sobre orden, inmutabilidad, asociación de medios y candados.
- Revisión visual e interacción de componentes reales en una ruta temporal con datos ficticios y estado de prueba en memoria. La ruta se eliminó antes de compilar la entrega; no se añadieron proyectos de demostración a la cuenta ni se hicieron solicitudes de generación.
- Se comprobó selección de escena por clic/flechas; orden por botones y arrastre real; edición bloqueada; ajuste/restablecimiento/comparación de prompt; exportación .txt verificada leyendo el archivo; concentración; ampliación/comparación en un fieldset bloqueado y devolución de foco con Escape.
- Las cuatro vistas se revisaron a 390 × 844; documento y contenido: 380 px, sin desbordamiento horizontal. Se restableció el viewport al terminar.
- Las capturas `docs/previews/stages-*.jpg` muestran la revisión aislada y llevan el aviso de datos ficticios. Son evidencia de diseño, no producciones del usuario.
- Pendiente validación completa con sesión real, medios de producción cargados, persistencia remota del orden y conflictos entre dispositivos. Se reutiliza el contrato de PERSISTENCIA.md y no se ejecutan migraciones.
- No hay telemetría nueva, porcentajes temporizados, generación automática de medios ni almacenamiento de clips nuevo.


## Resultado de comprobaciones

`npm run check` correcto: TypeScript, lint, 55 comprobaciones y build de 18 páginas. Se mantienen los seis avisos de lint anteriores; los componentes nuevos no añaden avisos. El JavaScript inicial informado por Next pasa de 341 a 346 kB; no hay dependencias nuevas. La primera comprobación tras retirar la ruta temporal encontró tipos generados obsoletos en .next; se eliminó solo ese archivo generado y la comprobación completa posterior pasó.

### Capturas de revisión aislada

Las siguientes imágenes usan datos ficticios claramente identificados y referencias ya incluidas en el repositorio. No representan nuevos datos de la cuenta.

- [Guion y notas de dirección](previews/stages-guion.jpg)
- [Storyboard e inspector](previews/stages-storyboard.jpg)
- [Comparación de copia de prompt](previews/stages-prompts.jpg)
- [Sala de revisión sin clips cargados](previews/stages-revision.jpg)
