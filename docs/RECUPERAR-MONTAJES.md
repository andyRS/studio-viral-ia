# Recuperar el progreso del montaje

El servidor de montaje ejecuta el trabajo en un hilo independiente de la conexión del navegador. Después de recibir los clips puede continuar si se cambia de módulo o se cierra la página. En PC necesita que el equipo permanezca encendido, sin suspensión, y que «Montar en mi PC» siga abierto. Reiniciar el servidor pierde los trabajos que guarda en memoria. Los resultados caducan 30 minutos después de terminar. En Fly la continuidad depende de que la máquina siga activa; esta entrega no cambia su configuración.

## Interfaz

«Montajes y progreso» aparece en todos los módulos, fuera del contenedor que se desmonta al navegar. Recuerda en este navegador el identificador, servidor, título, inicio y estado terminal de cada montaje; separa los registros por usuario y modo local. No guarda vídeos, credenciales ni pases de acceso.

MontajePanel registra el ID en cuanto termina la subida. El panel global consulta el mismo trabajo con GET y espera el progreso real. Al volver a abrir la app o recargar, recupera sus datos. Permite consultar los últimos pasos, reconectar tras un error y descargar el vídeo, segunda versión o extras cuando estén disponibles. La descarga global no cambia el estado editorial del episodio.

Si el servidor no responde, conserva la última lectura y avisa; no inventa porcentajes ni vuelve a generar. Un 404 informa de caducidad o reinicio. «Retirar del panel» solo borra la referencia local, no cancela el montaje. Se evita iniciar otro montaje del mismo título mientras exista una referencia pendiente; si el servidor la perdió, puede retirarse antes de crear otro.

Para trabajos que empezaron antes de esta entrega, el formulario permite introducir el identificador de 32 caracteres que aparece en `/trabajos/…` en la consola del PC. Valida que exista antes de guardarlo. Los montajes nuevos se recuerdan automáticamente, después de subir los clips. Si el almacenamiento local falla, MontajePanel muestra el identificador para conservarlo manualmente.

No se añadieron migraciones ni se reinició o modificó el servidor de montaje: la recuperación funciona con el proceso ya abierto.

## Verificación

- Pruebas de guardado por cuenta, modo local separado, deduplicación, datos corruptos, cuota llena y validación de ID/servidor.
- Pruebas de seguimiento: consulta GET del mismo ID, secuencia de progreso, resultado listo, error, 404, desconexión, datos inválidos y aborto al desmontar. Reconectar no sube archivos ni crea otro trabajo.
- Navegador: se recuperó un trabajo real que ya estaba en marcha. Se cambió de módulo y se recargó la página; siguió consultándose el mismo ID con avance real. Se comprobaron ID inválido y trabajo inexistente.
- Sin desbordamiento horizontal en 390 y 320 px. Identificadores largos y controles se adaptan al ancho.
- Tipos, lint (los seis avisos previos) y compilación de producción. No se verificó la descarga final de esta película porque seguía procesándose.

La captura de verificación del trabajo real se conserva fuera del repositorio para no publicar su identificador.
