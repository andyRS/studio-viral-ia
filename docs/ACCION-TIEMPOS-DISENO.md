# Diseño del Director de acción y Tiempos del montaje

Revisión sobre `74a6620`. Alcance: presentación y estructura visual. Se conservan las funciones de cálculo, los handlers de edición/aprobación, los datos, el guardado y las migraciones del otro agente.

## Ajustes

- Director organizado en secuencias, storyboard e inspector, con títulos y navegación contextual.
- El ancho del propio panel decide la distribución: una columna en espacios estrechos, secuencias arriba con storyboard e inspector en dos columnas desde 800 px, tres columnas desde 1200 px. Evita el centro comprimido de la distribución fija anterior.
- Listas de secuencias y tomas con desplazamiento interno. Los esquemas se identifican como bloqueo, sin presentarlos como imágenes generadas.
- Acceso al inspector de la escena seleccionada mediante enlace nativo y foco de teclado. Conserva selección y campos existentes.
- Leyenda de las fases; selección visible en la línea de tiempo y controles de al menos 44 px de alto.
- Tiempos con tres totales separados (vídeo, voz, montaje), controles agrupados y tabla con cabeceras fijas y región desplazable accesible al teclado. La voz sigue marcada como estimada o con mediciones, según los datos existentes.
- Corrección del input oculto para subir texto de referencia.
- Corrección adicional del director de escenas existente: sus pestañas ensanchaban la página a 341 px en una ventana de 320 px. La rejilla y las pestañas ahora respetan el espacio disponible.

## Verificación

Prueba manual en el navegador sin sesión, en `127.0.0.1:3001`, con el episodio de Daniel creado desde los fixtures durante la revisión anterior. Sin cambios en producción ni aprobación de propuestas.

- Seleccionar la escena 12 actualiza el inspector; marcarla habilita la aprobación existente.
- El enlace al inspector mueve el foco a `action-inspector`.
- Cambiar el modo de montaje y aplicar la recomendación actualiza la vista previa: 121 s de vídeo y ~102 s de montaje en el fixture, sin guardar.
- Tabla móvil: 740 px internos dentro de 302 px disponibles; flecha derecha desplaza la tabla 40 px, sin mover el ancho de página.
- 390 px: documento de 380 px; 320 px: documento de 310 px después de corregir las pestañas del director anterior.
- 1680 px: director en tres columnas (230 / 746 / 330 px). 1280 px: storyboard e inspector en dos columnas. Móvil: una columna.

Capturas: `docs/previews/action-workspace.jpg`, `action-mobile.jpg`, `timing-workspace.jpg` y `timing-mobile.jpg`.

Comprobaciones: tipos, lint y todas las pruebas TypeScript pasan. `npm run check` se detuvo en su último comando de pruebas porque `python3` apunta al acceso de Microsoft Store de Windows. Se ejecutaron las siete pruebas de montaje con `python -m unittest montaje/test_tiempos.py`: pasan. La compilación se ejecutó por separado con `npm run build`. No se modificó el script de pruebas ni la configuración del equipo. Lint conserva los seis avisos anteriores. No se añadieron dependencias ni animaciones.
