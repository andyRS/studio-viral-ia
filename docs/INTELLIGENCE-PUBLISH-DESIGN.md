# Intelligence Hub y Publish & Grow

Renovación de interfaz sobre los contratos actuales. Conserva la base petróleo, cyan/hielo y dorado de Creative Studio. Inicio inteligente, migraciones, DataContext, servicios de almacenamiento y esquemas no cambian.

## Intelligence Hub

- **Rendimiento:** cabecera editorial, navegación a secciones, filtros con restablecimiento, indicadores con su cobertura, cuentas seleccionables y biblioteca existente. Las barras se pueden seleccionar con ratón o teclado; el detalle indica fecha, vistas y cantidad de publicaciones. Se conservan las ocho fechas de publicación más recientes del cálculo anterior y se explicita ese límite.
- Las barras representan vistas acumuladas agrupadas por fecha de publicación. No son una curva diaria, un crecimiento calculado ni una predicción. Los indicadores sin registros muestran raya. La retención conserva el denominador de registros que aportan el dato.
- **Laboratorio narrativo:** transcripción y notas junto a una guía de gancho, giro y cierre. Contador de palabras/caracteres, resultados legibles y biblioteca de estructuras. «Explorar estructura» consulta el registro guardado sin generar ni volver a guardar. Se conservan los handlers de IA y plantilla local; sus avisos distinguen la fuente.
- MetaConnect, importación, asociación de episodios, comparador, rankings y registro manual siguen disponibles. La presentación de EpisodeInsights utiliza la misma paleta.

## Publish & Grow

- **Calendario:** navegación semanal anterior/siguiente/Hoy, filtros por cuenta y plataforma, resumen de la semana visible, vista de tarjetas y agenda. La agenda lista solo días con entradas; Semana permite elegir cualquier día.
- «Añadir» en un día precarga la fecha, enfoca el título y desplaza al formulario. No inserta nada hasta enviar el formulario. Se mantiene el contrato `insert("calendarEntries", ...)`; la UI bloquea el envío durante la espera y conserva los campos si se rechaza. El aviso confirma que se añadió al plan, sin afirmar publicación o sincronización remota.
- La búsqueda global continúa abriendo la semana de una entrada; «Hoy» vuelve a la semana actual incluso si se llegó desde una entrada antigua. El borrado conserva la confirmación existente.
- **Cuentas:** directorio con búsqueda y filtro, monogramas, plataforma, perfil creativo y conteos de series/entradas asociadas. El perfil se organiza en identidad, comunidad y universo creativo; todos los campos y handlers anteriores permanecen montados. Abrirlo enfoca el encabezado, cerrarlo devuelve el foco al disparador.
- Los perfiles de partida existentes quedan en un desplegable. No se ejecutan al abrirlo. Crear una cuenta de trabajo no implica una conexión con una red social.

## Integración

- `WorkspaceIntro.tsx` comparte cabecera y estado de carga. Mientras `mode === "cargando"`, los cuatro módulos muestran carga en lugar de ceros aparentes.
- `growth-workspaces.css` está importado después de las capas visuales anteriores y limita sus reglas a estos espacios. Foco visible y desplazamientos que respetan movimiento reducido.
- Solo dos textos de navegación en `page.tsx` cambian: descripción de cuentas y «Planificar publicación». Los IDs y el retorno OAuth `?modulo=metricas` siguen iguales.
- Se usa `mode`/`isLocalOnly` para distinguir perfiles locales de perfiles de cuenta. Las alertas globales de guardado y conflictos permanecen en PersistenceNotice/SessionBar. No se ejecutan migraciones ni se modifica persistencia.
- Borradores de formularios y selecciones son estado de componente, como antes. No se presenta persistencia nueva, publicación automática, nuevas conexiones ni histórico de métricas.

## Validación

- `npm run check` completado: TypeScript, ESLint, las 55 comprobaciones existentes y compilación de producción (18 páginas). Permanecen los seis avisos previos de page.tsx/GeneratorModule; no hay avisos nuevos. First Load JS de la raíz: 351 kB (346 kB antes de este bloque). No se añaden dependencias.
- Navegador local: estados vacíos de los cuatro módulos, filtros de métricas y reinicio, selección de barra, lectura del archivo de análisis sin regeneración, navegación de semanas y Hoy, filtros de agenda, precarga de fecha, apertura/cierre y secciones del perfil.
- Revisión con contenido en un origen distinto, `http://127.0.0.1:3000`, sin sesión. Dos métricas, dos entradas de calendario y un perfil de prueba se crearon con los formularios normales; una plantilla de análisis se generó localmente, sin llamada a IA. Los títulos llevan «PRUEBA DE DISEÑO». No se modificaron registros de producción ni datos del origen localhost.
- Las métricas de prueba sumaron 20.600 vistas, 1.090 interacciones y 60 seguidores. Retención 62 % con un solo registro que aporta ese dato. Un filtro sin coincidencias mostró raya y cero publicaciones medidas.
- Móvil: 390×844 y 320×740. En los cuatro módulos, ancho del documento igual al viewport útil (380 y 310 px respectivamente); el gráfico mantiene desplazamiento interno. Se corrigió el mínimo implícito de las columnas del gráfico para evitar desbordamiento.
- Capturas siguientes contienen datos ficticios y/o los perfiles iniciales incluidos en la app. No representan resultados reales: [rendimiento](previews/growth-intelligence.jpg), [gráfico](previews/growth-signals.jpg), [laboratorio](previews/growth-analyzer.jpg), [agenda](previews/growth-calendar.jpg), [cuentas](previews/growth-accounts.jpg), [móvil](previews/growth-mobile.jpg).
- La revisión no valida conexiones OAuth, sincronización remota, conflictos entre sesiones ni publicación en redes. Esos contratos y su persistencia siguen a cargo del agente de desarrollo.
