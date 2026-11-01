# Revisión visual del formato por episodio y la subida de clips

Sobre `fb817bd`, conservando los cambios de formato del episodio y de importación del otro agente.

- Selector «Formato de imagen» con indicación «Solo este episodio» y símbolo de orientación que refleja el valor actual. Acciones agrupadas y adaptadas al ancho; el título conserva su espacio.
- Barra «Subir todos los clips» con acción destacada en dorado y ayuda para soltar archivos incluso cerrada. El estado de arrastre existente ahora tiene borde y fondo visibles en la barra.
- Zona de carga en petróleo con foco de teclado e input oculto contenido; nombre accesible «Subir clips e imágenes del episodio».
- Texto de guardado actualizado: se remite a los avisos reales del navegador, eliminando el aviso antiguo de pérdida de vídeos al cerrar.
- El capítulo importado ya no se anuncia como «publicado» o «solo lectura» por el mero hecho de importarlo. El texto diferencia terminado de disponible para revisión usando el estado existente, sin cambiar permisos.

No se tocaron los handlers, reglas de formato, asignación de archivos, migraciones ni persistencia. Sin dependencias ni animaciones nuevas.

Validación: tipos, lint (seis avisos anteriores), compilación y 24 comprobaciones de tiempos/formato. Inspección manual de cabecera y mesa a 1280, 390 y 320 px; sin desbordamiento horizontal. Se usó el episodio ficticio de Daniel en `127.0.0.1:3001`, sin sesión. Para abrir la mesa se subió el mismo retrato sintético del repositorio a las seis fichas locales y se aprobaron únicamente esas referencias de prueba. No son referencias canónicas reales. No se procesaron vídeos ni se modificaron datos de producción.

El arrastre de archivos sobre la barra conserva los handlers anteriores; en esta revisión no se simuló una suelta nativa. Se verificaron el estado inicial abierto, el control accesible de subida, el foco y el diseño responsive.

Capturas: `docs/previews/review-upload.jpg` y `docs/previews/review-upload-mobile.jpg`.
