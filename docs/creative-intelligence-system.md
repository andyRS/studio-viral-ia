# Creative Intelligence Studio · sistema UX/UI

## Identidad

Estudio Viral combina una interfaz de producción audiovisual con análisis verificable. El naranja guía acciones creativas y el azul distingue análisis y conexiones. Las superficies oscuras dejan espacio al contenido; el brillo se limita a los puntos de decisión.

| Uso | Token | Valor |
| --- | --- | --- |
| Fondo | `--bg` | `#090D16` |
| Superficie | `--card` | `#151C2B` |
| Acción principal | `--accent` | `#FF9F1C` |
| Inteligencia | `--ai` | `#598BFF` |
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
