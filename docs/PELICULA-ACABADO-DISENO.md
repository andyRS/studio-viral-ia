# Integración visual del acabado de películas

Revisión sobre `c9b568c`. Se conservan petróleo, cyan/hielo y dorado, sin tocar lógica, migraciones, persistencia ni procesamiento de vídeo.

- Montaje con cabecera propia y panel «Presentación de la película»: subtítulos, apertura, transiciones y estado de recursos. Nombres cortos y explicaciones completas fuera del selector para facilitar la lectura en móvil. Valores y handlers originales.
- Recursos opcionales de cada escena en una tarjeta diferenciada. Su carga tiene nombre accesible y foco de teclado (antes el input estaba oculto con `display:none`).
- Navegación de partes con título y selección cyan; unión final con campo de archivos etiquetado y acción dorada.
- Herramientas destaca «Para el chat» a todo el ancho, conservando sus instrucciones de ZIP y partes de menos de 30 MB.
- Campos contenidos y estructura apilada en móvil; sin dependencias ni animaciones nuevas.

## Validación

Tipos, lint (los seis avisos previos), compilación y las pruebas existentes de formato épico/película larga.

Se renderizaron MontajePanel y UnirActos con datos ficticios en una ruta local temporal, eliminada antes de compilar y entregar. Se comprobó el cambio de subtítulos, apertura y transiciones; el botón de montaje y el de unión permanecen deshabilitados sin archivos. No se enviaron vídeos al PC ni a la nube.

Sin desbordamiento global en 1280, 390 y 320 px (documentos de 1270, 380 y 310 px). Herramientas también se comprobó en su módulo real a 320 px. La navegación de partes y la tarjeta de recurso se revisaron en código; no se simuló una película con todos sus clips aprobados para abrir esas condiciones en la mesa real.

Capturas del componente real con datos ficticios: `docs/previews/film-finishing.jpg` y `film-finishing-mobile.jpg`.
