# Diseño de importación y revisión cinematográfica

Revisión visual sobre `5d7afa5`. La nueva importación y el director por secuencia necesitaban integrarse en el lenguaje petróleo, cyan y dorado del estudio.

- Compositor con cabecera, capítulo y elenco opcional separados y numerados.
- Modos fidelidad/creativa con selección visible y foco de teclado; mismos radios y handlers.
- Resumen de reconocimiento destacado, conservando el texto calculado por el importador.
- Importación de personajes y continuidad con paneles consistentes; errores mantienen color semántico.
- Revisión de dirección en tarjetas por escena: diálogo, beat, presencia, cámara, imagen, vídeo, duración y fidelidad. Dos columnas en escritorio y una en móvil; lista desplazable y accesible al teclado.
- Control de archivo con foco visible y posicionamiento del input oculto corregido: antes extendía el documento horizontalmente.

No se modificaron peticiones, normalización, aprobación, generación, lógica, migraciones ni persistencia. Sin dependencias ni nuevas animaciones.

## Validación

Tipos, lint (los seis avisos previos), pruebas de lógica y compilación de producción. Prueba manual en navegador aislado `127.0.0.1:3001`, sin sesión: reconocimiento de los fixtures de Daniel, alternancia de modos, creación local y propuesta de revisión de 20 escenas. No se aprobó la propuesta ni se tocaron datos de producción.

Anchos comprobados: 1280, 390 y 320 px para importación, y 390 px para revisión. Sin desbordamiento horizontal. Tecla Fin en la lista de revisión permite llegar a la escena 20.

Capturas de los fixtures de prueba en `docs/previews/import-composer.jpg`, `import-mobile.jpg` y `direction-review.jpg`.
