# Creative Studio: bibliotecas y acabado

Capa de interfaz sobre `6462eb3`. Mantiene petróleo, cyan/hielo y dorado y reutiliza `WorkspaceIntro`, `WorkspaceLoading`, `ReferencePreview`, `PromptWorkbench` y los tokens de Aurora. No cambia esquemas, migraciones, servicios, DataContext ni las operaciones de integridad de los directores.

## Áreas renovadas

| Área | Presentación e interacción |
| --- | --- |
| Personajes | Galería por serie con retrato, identidad, estado real de referencia y aprobación. Búsqueda, filtro de serie y filtro de aprobación. Identidad, subida de imagen, acento, color y biblia en un desplegable por ficha. Series sin personajes y personajes sin serie siguen accesibles. |
| Fórmulas | Catálogo seleccionable con búsqueda y categorías; cuaderno lateral con el contenido completo. Inspector apilado en móvil con desplazamiento y foco al elegir una fórmula. Copia del contenido guardado y vista previa de pasos mientras se escribe una fórmula nueva. |
| Estudio Dola | Preparación a la izquierda y espacio externo a la derecha, con pestañas en móvil. Episodio, referencias y preparación usan los datos existentes. El iframe se abre bajo petición con «Abrir espacio integrado»; antes se muestra una mesa de espera. El punto del encabezado ya no implica una conexión verificada. |
| Producción | Resumen de tarjetas, etapas manuales y costos registrados. Tablero de cinco fases con desplazamiento horizontal dentro del panel. Selección de tarjeta y controles contextuales de etapa, vínculo y eliminación; revisión y alta en paneles complementarios. |
| Herramientas | Cabecera de acabado local, estado real del montaje, accesos a las dos estaciones, elección visual de calidad y zona de selección de archivo. El progreso numérico se etiqueta como transferencia al PC; no como porcentaje del procesamiento. |

## Contratos conservados

- Los handlers de creación, aprobación, restauración, imagen, acento, color y biblia de personajes permanecen; también su cola de guardado. La búsqueda global conserva el ID de tarjeta y restablece los filtros al abrir un personaje.
- Las fórmulas importadas se siguen interpretando con los helpers anteriores. El filtro cambia lo visible, no los registros. La vista previa usa los mismos pasos separados por punto y coma que el formulario existente.
- Dola conserva las comprobaciones de elenco, fichas aprobadas, versiones y cierre. La exportación del paquete no cambia. El botón de ir al Generador solo utiliza la navegación existente de page.tsx. La sesión y disponibilidad del proveedor externo no se presentan como comprobadas.
- Producción conserva las etapas, restricciones de borrador, vínculos, firmas de revisión y confirmaciones de eliminación. Los costos son sumas registradas, no estimaciones nuevas ni costos derivados de la IA.
- Herramientas conserva las rutas, solicitudes, parámetros, selección de zonas y controles del proceso local. No se inicia ni instala el montaje del PC. Sus acciones siguen deshabilitadas si el servicio no está listo.
- Los directores, Inicio inteligente, Intelligence Hub y Publish & Grow no cambian. La nueva hoja `creative-libraries.css` está limitada a estas superficies.

## Revisión visual y funcional

`npm run check` pasó: tipos, ESLint (los seis avisos anteriores), todas las pruebas de lógica existentes y compilación de producción de 18 páginas. First Load JS de la raíz: 183 kB, sin cambio respecto a la base. No se añaden dependencias.

Se usó el origen local separado `http://127.0.0.1:3000`, sin sesión. Mediante los formularios existentes se añadieron una serie, dos personajes, una fórmula, dos tarjetas y un costo ficticios. Sus nombres llevan «PRUEBA VISUAL». La foto reutilizada en la ficha de prueba es `public/elenco/peliculasquenoexisten/camila.webp`, ya incluida en el repositorio; no se generó una nueva imagen ni se modificó el archivo. No se escribieron datos en producción.

Comprobado en navegador:

- Galería vacía y con contenido; búsqueda y filtro de aprobadas; subida local, aprobación de la referencia, ampliación y Escape; identidad y biblia desplegadas.
- Fórmula importada legible, filtro de categoría, tres pasos de una fórmula nueva y lectura en el inspector después de guardarla localmente.
- Dos tarjetas en etapas distintas; cambio manual a Montaje y resumen de un costo ficticio de US$1.25. Desplazamiento del tablero mediante teclado.
- Dola sin episodios, mesa de espera y alternancia móvil Prompts/Dola; no se realizó login ni generación externa.
- PC sin conectar, opciones de calidad seleccionables y procesamiento deshabilitado. No se probó procesamiento de archivos con el servicio GPU.
- Los cinco módulos cargados a 390×844 y 320×740: ancho del documento igual al viewport útil (380 y 310 px). El tablero mantiene su desplazamiento interno. Personajes con biblia abierta también se comprobó a 320 px.
- El inspector de fórmula recibe foco en móvil (`formula-inspector-title`). Se restableció el viewport al terminar.
- El espacio externo de Dola tiene foco y desplazamiento vertical propios para acceder con teclado a su ayuda cuando el contenido supera el alto disponible.

Capturas con registros ficticios y fórmulas iniciales del repositorio: [Personajes](previews/creative-characters.jpg), [galería](previews/creative-cast-gallery.jpg), [Fórmulas](previews/creative-formulas.jpg), [Fórmulas en móvil](previews/creative-formulas-mobile.jpg), [Producción](previews/creative-production.jpg), [Herramientas](previews/creative-tools.jpg), [Dola](previews/creative-dola.jpg).

Las pruebas de persistencia remota, procesamiento local y generación externa siguen fuera de esta entrega de diseño. No se modificó ni volvió a ejecutar localmente la batería Playwright; sus selectores y los contratos usados permanecen disponibles.
