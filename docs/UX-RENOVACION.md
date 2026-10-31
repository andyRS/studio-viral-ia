# Renovación · Cinematic Creative Intelligence

## Diagnóstico previo a implementación · 31 octubre 2026

Auditoría de código: Next.js 14 App Router, React 18 y TypeScript; módulos de dashboard seleccionados en `page.tsx`, rutas API independientes, Tailwind y CSS global. Inter ya está instalada mediante next/font. No hay biblioteca de animación ni de componentes. DataProvider centraliza Supabase, sesión, RLS existente y colecciones locales; algunos proyectos largos dependen de una migración opcional. IA mediante rutas autenticadas, proveedores configurados en servidor y respuestas completas (sin streaming ni telemetría de fases). No se deben mostrar porcentajes temporizados.

### Prioridades

1. **Alta / riesgo bajo:** identidad semántica, navegación y acciones para retomar episodios desde Inicio. El inicio actual muestra listas sin navegación directa; la acción del generador envía a Producción y no abre una creación. Dar protagonismo al trabajo y al siguiente paso.
2. **Alta / riesgo medio:** workspace de creación con resumen de decisiones y estado de solicitud real. Mantener formularios, reglas de canal, estilos y servicios existentes. Mostrar datos guardados progresivamente durante la persistencia, sin atribuir fases imaginarias al modelo.
3. **Alta / riesgo medio:** reordenar escenas de proyectos largos con persistencia e historial, teclado y respeto de candados. Las escenas cortas tienen revisiones y archivos asociados por índice: no reordenarlas sin migrar esas asociaciones.
4. **Media / riesgo bajo:** ampliar y comparar fichas existentes en un diálogo accesible. Ya existen imágenes y versiones aprobadas, pero se muestran pequeñas entre formularios extensos.
5. **Media / riesgo bajo:** tokens de movimiento, estados de foco, controles táctiles y entrada de paneles. Reutilizar CSS y evitar dependencias pesadas.

### Áreas revisadas

- Inicio: datos reales, estados vacíos honestos; faltan accesos para continuar y una jerarquía orientada a crear.
- Creative Studio: ya hay biblioteca, selección de estilos y canales, arquitectura por actos, comparación de guiones, prompts y montaje. Exceso de densidad; priorizar contexto y manipulación directa.
- Personajes: aprobación, versiones y continuidad presentes. Añadir inspección ampliada sin alterar aprobación ni carga.
- Intelligence Hub: métricas, filtros, gráficos y estados vacíos existentes; conservar datos y comparaciones, aplicar superficies y foco compartidos.
- Publish & Grow: calendario semanal, detalle y formularios conectados; conservar sincronización y acciones actuales, aplicar tokens comunes.
- Dropshipping: espacio independiente, CRUD y pruebas; conservar separación, aplicar superficies y controles comunes.
- Navegación: búsqueda global y Ctrl+K existentes; faltan sugerencias sin consulta. Los módulos se desmontan al cambiar de área: avisar si hay edición sin guardar mediante protecciones locales cuando proceda, sin prometer autosave general.

### Dirección visual

Fondo tinta #090B14, superficies #121625 / #191E30, violeta para creación y selección, cyan para actividad, dorado para hitos cinematográficos; verde para aprobación y rojo para errores. Gradientes en marca, hero y acciones principales. Inter con títulos de composición editorial y metadatos compactos. Movimiento de 140/200/300/480 ms, transform y opacity; movimiento reducido obligatorio. Sin partículas ni fondos animados permanentes.

### Alcance y límites de validación

Auditoría estática de los módulos, sin acceso a una sesión autenticada de producción. La inspección visual con computer-use fue bloqueada por no poder determinar la URL del navegador con suficiente confianza. No se han revisado visualmente escritorio/móvil ni certificado WCAG o Core Web Vitals. No se modifica backend, RLS, esquemas ni datos de producción.

## Alcance acordado e implementación

El usuario aclaró que este agente se encarga del diseño y otro agente de migraciones y desarrollo. Se implementó la capa de presentación y navegación sobre los contratos existentes. Los puntos de desarrollo se entregan en `ENTREGA-AGENTE-DESARROLLO.md`.

- Identidad en `cinematic.css`: tokens, superficies, controles y motion compartidos. Sin dependencias nuevas.
- Inicio MissionControl: composición editorial, acciones de crear/retomar, episodios y calendario reales, skeleton de carga y estados vacíos.
- Creación: apertura directa, resumen dinámico y espera honesta; sin cambios en servicios ni persistencia.
- Mesa de dirección: etapas con recuentos guardados, acceso a paneles existentes y mensaje de pausa que explica cuándo surte efecto.
- Referencias: diálogo ampliado, Escape, foco y comparación de versión previa cuando existe; integrado en personajes y elenco del episodio.
- Storyboard: cuadrícula/secuencia y ampliación de imágenes existentes; se conserva la edición y los controles anteriores de orden.
- Búsqueda: acciones sin consulta, cierre por Escape, foco fuera o clic exterior, y salto al contenido.
- Inteligencia, publicación y dropshipping: sistema compartido de superficies/acciones y navegación, conservando la organización funcional.

## Comprobaciones después de los cambios

- `npm run typecheck`: correcto.
- `npm test`: 29 comprobaciones existentes correctas.
- `npm run build`: correcto, 18 páginas generadas. Ruta principal: 333 kB de JS inicial informado por Next; medir y dividir por módulos con el agente de desarrollo.
- `git diff --check`: correcto (Git informa únicamente la normalización de finales de línea del .bat preexistente del usuario).
- Smoke HTTP de producción: inicio y login responden 200; contenido SSR del nuevo inicio y CSS cinematográfico presentes. No es una prueba de interacción en navegador.
- `npm run lint`: no disponible como comprobación reproducible; abre el asistente de configuración de ESLint. No se alteró la configuración del proyecto.
- Pendientes: prueba manual visual y funcional en escritorio/móvil, sesión autenticada, lector de pantalla, contraste completo y Web Vitals. Build y TypeScript no sustituyen estas pruebas.

No se implementó arrastre nuevo, autosave general, historial de medios persistente ni telemetría del backend. No se desplegó ni se ejecutaron migraciones. El cambio previo del usuario en montaje se conserva.


## Dirección revisada según referencias del usuario

Se sustituyó la composición inicial de hero y KPIs por una mesa de edición: herramientas verticales, lienzo central, compositor de premisas, cuaderno contextual y tira de proyectos. La paleta vigente es azul petróleo con reflejos hielo y acentos dorados; la referencia visual no revoca la preferencia explícita de evitar morado.

El lienzo abre el episodio más reciente si existe. Sus imágenes se obtienen de referencias guardadas de personajes y están etiquetadas como tales. Si no hay datos, presenta un lienzo vacío editorial, sin inventar películas, miniaturas o métricas. La caja de premisa lleva el texto al formulario existente; no inicia una generación por sí sola. La configuración dispone de un resumen lateral con decisiones y requisitos derivados de los campos actuales.

### Validación en navegador disponible en esta revisión

- Se inspeccionó la pestaña de producción de Vercel: mantiene el diseño anterior. No se alteró su sesión ni sus datos.
- Se abrió una pestaña local de prueba y se verificó visualmente el nuevo inicio y la configuración de historias.
- Se escribió una premisa de prueba y se comprobó que llega íntegra al campo `generator-idea`; no se generó ni guardó una historia.
- Vista móvil de 390 × 844: se revisó el inicio y la navegación inferior; DOM reporta 380 px de ancho de documento y 380 px de contenido (sin desbordamiento horizontal; scrollbar dentro de viewport 390).
- Se restableció el viewport original al finalizar la prueba.
- La biblioteca local vacía es un estado real; no se copiaron datos de la sesión de producción para crear una demostración.

Esta revisión sustituye la limitación anterior de no poder inspeccionar visualmente el inicio. Siguen pendientes pruebas exhaustivas de todos los módulos con datos autenticados, lector de pantalla, contraste completo y Core Web Vitals. No se desplegó a Vercel.


## Ajuste de Inicio solicitado por el usuario

Se recuperó y reforzó su función de bienvenida y visión general, separándolo del editor. Nueva bienvenida cinematográfica con hero petróleo/hielo/dorado; cuatro indicadores navegables; panel de tarjetas de producción, borradores y fichas pendientes; calendario; episodios recientes; acceso a métricas. Los objetivos de cuenta siguen disponibles. La mesa de trabajo anterior se trasladó a CreativeDesk dentro del Generador.

Se comprobó en navegador la bienvenida y el acceso desde Visualizaciones a Intelligence Hub. Vista móvil 390 × 844 sin desbordamiento horizontal: documento/contenido 380 px. No se generaron datos de prueba ni se alteraron registros de la cuenta. Las validaciones con biblioteca vacía no sustituyen una revisión de todos los estados con sesión autenticada.


## Integración con persistencia · 31 octubre 2026

Se integró la implementación `a2aefac` del agente de desarrollo, leyendo `docs/PERSISTENCIA.md` y resolviendo únicamente los solapamientos de GeneratorModule y StoryArchitect. Se conservan creación reanudable, importación explícita, clasificación de fallos, respaldo por usuario y contratos de conflictos. PersistenceNotice añade su presentación global con acciones reales y mensajes persistentes; SessionBar conserva el indicador resumido.

`npm run check` pasa sobre el conjunto integrado: TypeScript, ESLint, 47 comprobaciones y build de 18 páginas. ESLint mantiene seis avisos conocidos de dependencias y semántica existentes; no se desactivaron reglas para ocultarlos. No se ejecutaron migraciones ni se probó una sesión autenticada de Supabase. El archivo de montaje previamente modificado por el usuario queda fuera de los commits y conserva el mismo SHA-256 antes y después de la integración.

Estado actual del traspaso: puntos 1–5 y 10 completados e integrados por desarrollo; parte del 13 cubierta por 18 pruebas nuevas. La migración `20261104_revisiones.sql` está en el repositorio y sigue pendiente de ejecución en Supabase junto con las anteriores que no se hayan aplicado. Las fases de IA observables y el almacenamiento de medios siguen pendientes de contrato.


## Interior del estudio · siguiente bloque

Se implementaron las cuatro referencias dentro de Creative Studio: lectura y dirección por escena; storyboard con inspector y orden por puntero/teclado; trabajo enfocado de copias de prompts; revisión central de clips y referencias. Detalle en ETAPAS-CREATIVE-STUDIO.md. La ruta de revisión visual con datos ficticios fue temporal y se eliminó antes del build. Inicio inteligente y los contratos de persistencia se conservan. Se añadieron 8 comprobaciones de orden y candados a las 47 existentes.

Verificación final del bloque: `npm run check` correcto (55 comprobaciones, build de 18 páginas, seis avisos de lint previos). La ruta temporal de pruebas no forma parte de las páginas entregadas.
