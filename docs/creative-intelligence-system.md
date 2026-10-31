# Creative Intelligence Studio · sistema UX/UI

## Identidad

Estudio Viral combina una interfaz de producción audiovisual con análisis verificable. El azul petróleo guía acciones creativas y selección, el cyan distingue inteligencia y actividad, y el dorado destaca hitos cinematográficos. Las superficies oscuras dejan espacio al contenido; el brillo se limita a los puntos de decisión.

| Uso | Token | Valor |
| --- | --- | --- |
| Fondo | `--bg` | `#080F14` |
| Superficie | `--card` | `#101E27` |
| Acción principal | `--accent` | `#36B8C4` |
| Inteligencia | `--ai` | `#22D3EE` |
| Hitos cinematográficos | `--cinema` | `#F5BC69` |
| Éxito | `--success` | `#34D399` |

La tipografía principal es Inter con fuentes del sistema como respaldo. Las tarjetas usan una escala de radios consistente, borde tenue y sombra corta. La animación de entrada se desactiva cuando el sistema solicita reducir movimiento. Los controles muestran foco visible y un estado de carga o vacío específico.

## Mapa de navegación

- **Inicio inteligente:** proyectos recientes, trabajo pendiente, próximas publicaciones y métricas disponibles.
- **Creative Studio:** Generador, Estudio Dola, Personajes, Fórmulas y Producción.
- **Intelligence Hub:** Métricas y Analizador.
- **Publish & Grow:** Calendario y Cuentas.
- **Dropshipping:** espacio independiente.

Los identificadores antiguos de módulo continúan válidos. En particular, `?modulo=metricas` permanece como retorno de la conexión con Meta.

## Reglas para mostrar datos

- El valor `—` significa que no hay un dato suficiente para calcular el indicador; `0` significa un valor registrado de cero.
- La fecha de publicación (`Metric.date`) y el momento de registro (`Metric.capturedAt`) se etiquetan por separado.
- Las vistas son acumuladas en el momento de cada captura. La gráfica por fecha de publicación **no** representa evolución diaria.
- La retención media solo usa los registros que incluyen `Metric.retention`; indica cuántos registros contribuyen.
- El análisis por segundo y el reproductor sincronizado requieren una serie temporal y un archivo de video accesible. El panel de episodio explica su ausencia.
- Las recomendaciones muestran su fuente. Las plantillas locales se identifican como plantillas, sin atribuirles análisis de IA.
- Las publicaciones sin `episodeId` se revisan antes de vincularlas. Una coincidencia de título es una sugerencia, no una asociación automática.

## Componentes y comportamiento

- **Tarjeta de KPI:** etiqueta, valor, denominador o cobertura, estado vacío.
- **Biblioteca:** miniatura, plataforma, cuenta, fecha publicada, métricas acumuladas y acceso al episodio.
- **Integración:** estado real, páginas seleccionadas, importación y gestión en panel desplegable.
- **Eliminar:** acción contextual o confirmación; nunca un borrado inmediato.
- **Búsqueda global:** encuentra registros guardados y lleva al módulo o registro correspondiente.
- **Móvil:** cuatro espacios principales en navegación inferior, módulos internos en pestañas desplazables y lista completa en «Más».

## Datos necesarios para las siguientes fases

1. Guardar capturas periódicas por publicación con hora y fuente para evolución, comparaciones y alertas.
2. Incorporar puntos de retención por segundo, duración real y una URL de video reproducible para el mapa sincronizado.
3. Guardar vínculos explícitos entre episodio, versión, publicación y plataforma; evitar comparar publicaciones no equivalentes.
4. Definir la fórmula pública de Viral Score por plataforma y validarla con datos observados antes de mostrar una puntuación.
5. Registrar experimentos A/B y sus ventanas de medición antes de atribuir resultados a un hook.
6. Añadir estado de sincronización por conexión para distinguir «no conectado», «sin publicar», «importando» y «sin datos disponibles».

Las fases avanzadas dependen de estos contratos de datos. No se presentan curvas, puntuaciones ni recomendaciones causales de ejemplo como resultados reales.

## Renovación cinematográfica · 31 octubre 2026

La capa visual se encuentra en `src/app/cinematic.css`, importada después de globals. Las reglas heredadas quedan disponibles para migrarlas por componentes sin tocar servicios ni esquemas. Tokens de movimiento: 140 ms feedback, 200 ms controles, 300 ms paneles y 480 ms momentos expresivos. Solo los estados de espera animan continuamente mientras están presentes; se respeta movimiento reducido.

- MissionControl muestra episodios y publicaciones reales, navegación directa y estados vacíos accionables. «Retomar» abre el episodio de creación más reciente; no pretende recordar la última escena editada.
- Crear historia abre directamente la configuración existente. El resumen refleja canal, estilo, formato de serie y duración de cada clip; no cambia las reglas de generación.
- Ctrl+K ofrece acciones y módulos sin consulta, y conserva búsqueda de registros. Enter elige el primer resultado; Tab recorre los botones; Escape y clic fuera cierran.
- ReferencePreview utiliza diálogo nativo con Escape, foco contenido y devolución de foco al disparador. Compara la imagen actual con la última referencia del historial cuando existe. No escribe ni restaura versiones.
- El storyboard tiene cuadrícula y secuencia horizontal y permite ampliar imágenes existentes. Los controles previos de orden, edición y prompts conservan sus handlers.
- La mesa por actos y el episodio muestran etapas calculadas a partir de datos guardados. «Prompts disponibles» no significa imágenes generadas. «Vídeo descargado» proviene del estado Terminado existente.
- Calendario, producción, métricas, cuentas y dropshipping reciben superficies, controles, foco y navegación compartidos. Conservan sus flujos especializados. No se afirma una reconstrucción completa de cada módulo.

Validación visual pendiente: computer-use bloqueó la sesión por no poder determinar con confianza la URL del navegador. Layouts adaptables implementados en CSS; no se ha certificado WCAG 2.2 AA ni medido Core Web Vitals.

Preferencia actual del usuario: base azul petróleo, reflejos hielo y acentos dorados. Se retiraron los tonos violetas de la capa cinematográfica y de las utilidades de los componentes. Las acciones rellenas utilizan petróleo profundo para conservar contraste con texto blanco.


## Composición de referencia · mesa de edición

La mesa de trabajo de Creative Studio se organiza alrededor de un lienzo y herramientas creativas, con un cuaderno contextual a la derecha. El Inicio inteligente conserva bienvenida, indicadores, pendientes, calendario y proyectos. La premisa del compositor se entrega como estado inicial de la configuración, sin escrituras ni generación automática. El inspector de configuración resume decisiones reales; los checks indican campos seleccionados, no etapas de IA ejecutadas. El nombre del componente MissionControl se conserva para facilitar integración.

Las capturas del usuario orientan composición, densidad y profundidad. No se copian sus imágenes como contenido de proyectos, ni se introduce su paleta morada. La pestaña Vercel es referencia de la versión publicada; la nueva presentación se prueba en localhost y todavía no está desplegada.


## Inicio inteligente: bienvenida y centro de operaciones

Por aclaración expresa del usuario, Inicio no es un editor. MissionControl presenta bienvenida cinematográfica, cuatro métricas iniciales (series, episodios, tarjetas en producción y visualizaciones acumuladas medidas), trabajo por resolver, próximas publicaciones y biblioteca reciente. Las metas de cuenta existentes siguen montadas por page.tsx.

Los pendientes proceden de productionCards con etapa distinta de Publicado; los borradores de episodios marcados Borrador o plantilla-local; las fichas por aprobar de personajes sin imagen o sin aprobación. No se suman estas categorías como si fueran tareas independientes sin solapamiento. Las visualizaciones usan la suma de métricas actuales, sin inventar variaciones o comparaciones temporales. Ausencia de métricas se representa con raya y explicación.

CreativeDesk conserva la mesa de edición visual dentro del inicio del Generador. La premisa pasa a la configuración existente sin guardar ni generar automáticamente. Sus referencias de personajes se etiquetan como referencias, no como escenas generadas. Se conserva el resto de biblioteca, banco de ganchos y archivo del Generador.
