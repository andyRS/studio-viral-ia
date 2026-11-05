# Importar un JSON como continuación de una serie

En «Subir guion o historia», al reconocer un JSON de capítulo aparecen dos destinos: «Crear episodio 1» (serie nueva) o «Continuar una serie» (serie existente). La elección solo se aplica a esta entrada de JSON; los flujos normales de idea y continuación con IA conservan su funcionamiento.

La continuación exige seleccionar la serie. Hereda su canal y estilo, propone el siguiente número de episodio y conserva el título del capítulo importado. El número incrustado en el archivo no reemplaza la numeración de la serie. Un Acto II se añade como episodio nuevo; no se agrega al final del guion anterior ni sustituye su contenido.

Se importa en modo fidelidad, conservando diálogos y orden. Al cambiar a continuación se seleccionan las escenas del JSON, en lugar de mantener una cantidad elegida para otra historia. La adaptación creativa queda deshabilitada en esta modalidad. Las opciones de nueva idea, ganchos y canal nuevo no se piden; el resumen muestra la serie elegida y su próximo episodio.

Las fichas guardadas de la serie prevalecen sobre copias antiguas o descripciones distintas incluidas en el archivo. Se rehacen los prompts usando ese elenco; solo se insertan personajes nuevos. No se reemplazan imágenes ni aprobaciones existentes. Los nuevos personajes necesitan la revisión de siempre antes de producir.

Se reutiliza el guardado reanudable existente con la serie de destino ya identificada y el número de episodio apartado. Si falla una operación, «Reintentar guardado» sigue desde lo pendiente sin volver a importar ni duplicar los pasos ya guardados. Una creación pendiente impide iniciar otra desde el mismo formulario. No hay cambios de tablas ni migraciones.

## Validación

Pruebas de siguiente número, fichas canónicas, conservación del episodio anterior y sus diálogos, personajes nuevos, ausencia de otra serie y reintento tras fallar el guardado. También se ejecutaron las pruebas existentes de persistencia.

En navegador local sin sesión (`127.0.0.1:3001`), se añadió «PRUEBA VISUAL · Acto II» a la serie ficticia de Daniel usada en revisiones anteriores. El JSON decía partNumber 99: se guardó como episodio 2, conservando el episodio 1 con sus 20 escenas y las seis fichas aprobadas. Tras recargar: una serie y dos episodios; siguiente episodio 3. No se tocaron datos de producción.

Comprobados el aviso al no elegir serie, el bloqueo de adaptación creativa y el diseño a 390 y 320 px, sin desbordamiento horizontal. Captura en `docs/previews/json-continuar-serie.jpg`.

Las pruebas de Supabase con sesión real y de importaciones simultáneas desde dos ventanas no forman parte de esta verificación; se usa la capa de inserción existente.
