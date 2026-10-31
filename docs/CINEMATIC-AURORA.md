# Cinematic Aurora 2.0

> **Entrega 2 (al final del documento):** paleta corregida a la identidad del estudio, director del proyecto largo, paneles redimensionables y transiciones comunes.

Esta es la primera entrega vertical: el editor de escenas del episodio, el compositor de prompts y el sistema de efectos. Las capturas usan datos de prueba (un episodio ficticio de «Daniel» con retratos sintéticos), no resultados reales.

## Auditoría (fase 0)

- **Stack.** Next 14 y React 18 con Tailwind y CSS por capas: `globals`, `cinematic`, `studio-stages` y `growth-workspaces`. No hay librerías de animación; las transiciones son CSS (`--motion-*` en `cinematic.css`) y respetan `prefers-reduced-motion`.
- **Mission Control y Creative Desk.** Ya existían: MissionControl, CreativeDesk, el recorrido de producción (`production-journey`), las pestañas del episodio, `GenerationStatus` y `PersistenceNotice`. Se conservan.
- **Editor de escenas anterior (`NarrativeDesk`).** Mostraba una escena a la vez, con una barra de escenas y un inspector de solo lectura. Tenía reordenado con ◀ ▶ y Alt+flechas, pero no permitía editar, duplicar ni deshacer, y no tenía vistas de storyboard ni de secuencia. Sigue en uso como `SceneRail` en las pestañas de imágenes y animación.
- **Datos reales disponibles.** Escenas del episodio (`output.scenes`), fichas maestras (`characters`), revisiones de clips (`clipChecks`), imágenes y clips de la mesa guardados en el navegador (`archivosTrabajo`), el historial del episodio (`versions`), `refreshPrompts` (rehace los prompts sin IA) y `ordenEscenas` (mover y renumerar).
- **Inconsistencias encontradas.**
  - Los textos en mayúsculas de 9 px del diseño anterior se leían mal, así que el director usa tamaños mayores.
  - El estado de producción salía de varios avisos sueltos; ahora está en un único pipeline.

## Lo nuevo

| Pieza | Archivo | Qué hace |
|---|---|---|
| Tokens y efectos | `src/app/aurora.css` | Paleta Aurora (obsidiana, paneles azules, cian para producción, naranja para creación, violeta para inteligencia), borde aurora, spotlight, foco aurora, energía de creación, menús flotantes y todo el layout del director. |
| Aurora Glow Engine | `src/components/AuroraEngine.tsx` | Un solo listener `pointermove` para todo el documento. Escribe `--mx`/`--my` en el elemento `[data-spotlight]` en un `requestAnimationFrame`, sin estado de React por movimiento. Incluye `PreferenciaEfectos` (Reducidos, Equilibrados o Cine) en la barra lateral; se recuerda en el navegador. |
| Scene Director | `src/components/SceneDirector.tsx` | Sustituye a `NarrativeDesk` en la pestaña Guion del episodio. Detalle abajo. |
| Operaciones de escena | `src/lib/ordenEscenas.ts` | Se añadieron `duplicarEscena` y `editarEscena` (la frase editada actualiza también el diálogo del montaje). |
| Guardado del director | `GeneratorModule` (`onCambiar`) | Cada cambio rehace los prompts sin IA, guarda la versión anterior en el historial y, si cambian los números de escena, renumera las revisiones y los archivos. |
| Compositor Aurora | `GeneratorModule` (`TipoMenu`), `CreativeDesk` | Idea, menú de tipo de pedido (historia nueva o réplica de un viral, las dos opciones reales) e indicador real de IA o plantilla local. Durante la generación el borde respira; si falla, el borde se pone rojo. |

## El Scene Director

- **Vistas:** Director, Storyboard, Secuencia y Guion. La escena elegida se mantiene al pasar de una vista a otra (del guion se vuelve al director en la misma escena).
- **Navegador de escenas.** Cada tarjeta muestra:
  - miniatura: el fotograma real subido a la mesa o, si no hay, la referencia del personaje, siempre indicado como tal;
  - número, título, frase, duración, personajes y estado real (Aprobada, Rehacer, Clip subido, Sin clip o Incompleta);
  - un menú «⋯» con mover, duplicar, ver prompts, ver en el guion e ir a la mesa.
- **Reordenar:** arrastrando con el ratón, o con el teclado (flechas para elegir escena; Alt+flechas para moverla).
- **Lienzo.** Muestra el clip o la imagen que el usuario subió y, si no hay, la referencia del personaje rotulada «SIN FOTOGRAMA». Debajo:
  - la frase con el color de subtítulo del personaje;
  - la continuidad: plano, cambio de lugar respecto a la escena anterior, transición y fichas aprobadas;
  - acciones: copiar los prompts, duplicar, actualizar prompts e ir a revisar el clip.
- **Inspector**, con pestañas Guion, Personajes, Ambiente, Cámara, Prompt, Audio y Producción. Se edita en el sitio y cada campo se guarda al salir de él.
- **Guardado y deshacer.** El estado de guardado se ve en todo momento (guardando, guardado o error). Se puede deshacer y rehacer con los botones o con Ctrl+Z y Ctrl+Shift+Z; cada paso se guarda de verdad, y al deshacer un movimiento las revisiones y los archivos también vuelven a su sitio.
- **Pipeline de producción.** Siete pasos: Guion, Personajes, Prompts, Imágenes, Clips, Revisión y Montaje. Todos salen de registros reales, sin porcentajes inventados, y cada paso lleva a su pestaña.
- **Vista Secuencia:** barra proporcional a la duración, con color por papel narrativo (gancho, clímax, resolución) y las escenas incompletas rayadas. Las filas muestran el tiempo acumulado y el cambio de lugar.
- **Vista Guion:** lectura en formato guion, con encabezado, acción, personaje, diálogo y beat, y modo concentración.
- **Episodios terminados:** solo lectura. No se puede mover, duplicar ni editar.

## Rendimiento y accesibilidad

- **Rendimiento:**
  - los efectos son solo CSS (gradientes y pseudo-elementos), sin WebGL;
  - las animaciones usan solo `transform` y `opacity`;
  - el spotlight se desactiva en pantallas táctiles, con efectos reducidos y con `prefers-reduced-motion`.
- **Teclado y lectores de pantalla:**
  - foco visible en todo;
  - pestañas del inspector con `role="tablist"` y menús con `role="menu"` (se cierran con Escape);
  - los estados se comunican con texto, no solo con color.
- **Móvil (390 px):** el navegador de escenas pasa a una tira horizontal y el lienzo, el inspector y el pipeline van apilados, sin desbordamiento horizontal.
- **Tamaño de la página inicial:** de 183 kB a 184 kB de First Load JS (el director se carga dentro del módulo, que ya era dinámico).

## Pruebas

- `npm run typecheck` y `npm run lint` pasan, con los mismos 6 avisos de antes.
- `npm test`: 63 comprobaciones; se añadieron las de duplicar y editar escenas.
- `npm run test:e2e`: 20 flujos en el navegador; se añadieron 6 del director:
  - la selección actualiza el inspector;
  - editar guarda la escena y el diálogo del montaje;
  - el estado de guardado es visible;
  - duplicar renumera las revisiones;
  - deshacer las devuelve a su sitio;
  - del guion al director se conserva la escena elegida.
- Capturas (datos de prueba): [director](previews/aurora-director.jpg), [storyboard](previews/aurora-storyboard.jpg), [secuencia](previews/aurora-secuencia.jpg), [guion](previews/aurora-guion.jpg), [compositor](previews/aurora-compositor.jpg), [móvil](previews/aurora-movil.jpg). Para comparar con el antes: [stages-guion](previews/stages-guion.jpg).

## Limitaciones y próximos pasos

- **Sin etapas internas de generación.** El servidor responde al final, así que la energía de creación indica «en curso», «error» o «listo», sin etapas.
- **Paneles de tamaño fijo.** El layout es adaptable por tamaño de pantalla, pero los paneles aún no se pueden redimensionar arrastrando.
- **Fotogramas solo de este navegador.** El lienzo enseña lo que el usuario subió a la mesa en este navegador; no hay imágenes en la nube.
- **Siguiente:**
  - llevar el mismo director al proyecto largo (actos → escenas → tomas), reutilizando `TomasPanel`;
  - aplicar el lenguaje Aurora al resto de Creative Studio y a las transiciones del dashboard (prioridad posterior, según el orden pedido).


## Entrega 2

### 1. Paleta unificada con la identidad del estudio

Aurora ya no introduce violeta ni naranja. Equivalencias:

| Antes | Ahora |
|---|---|
| Naranja `#ff8849` | Dorado `#f5bc69` (`--cinema`) |
| Violeta `#7255e9` | Hielo `#bfeef4` |
| Azul eléctrico `#1789d5` | Petróleo `#36b8c4` (`--creative`) |
| Cyan `#39c9ff` | Cyan `#22d3ee` (`--ai`) |

- **Fondos y paneles:** usan los de `cinematic.css` (`#080f14`, `#101e27`, `#172b35`).
- **Borde aurora:** dorado a la izquierda y cyan-hielo a la derecha.
- **Foco global de los textos:** borde cyan con un halo lateral dorado y hielo muy suave.
- **Botón principal:** degradado de petróleo a cyan.
- **Secuencia:** el gancho va en dorado, el clímax en petróleo intenso y la resolución en petróleo apagado.
- **Fuera de Aurora:**
  - la categoría «Invención» del canon (era fucsia) pasa a hielo;
  - el envío a Flow (era naranja) pasa a dorado;
  - el icono de nueva serie pasa a dorado.
- **Lo único que mantiene morado o naranja:** la marca de Instagram en Métricas, porque es el color de esa red.

### 2. Director del proyecto largo (`LongDirector.tsx`)

- **Dónde está:** es la pestaña «Director» de la mesa de dirección, y la de entrada cuando hay estructura.
- **Navegador:** actos → secuencias → escenas. Cada tarjeta muestra la imagen del storyboard de su primera toma o, si no hay, la del escenario rotulada como tal, y el estado real: sin guion, con guion, guion aprobado, aviso de canon o N/M tomas aprobadas.
- **Teclado y orden:** las flechas cambian de escena; Alt+↑/↓ la mueven dentro de su secuencia. No mueve ni atraviesa piezas bloqueadas, explica por qué, y guarda una versión en el historial del proyecto.
- **Lienzo:** encabezado, acto y secuencia, escenario y tensión.
  - **Tira de tomas:** las imágenes reales y el estado de cada toma; al pulsarlas se abre Tomas y storyboard en esa escena.
  - **Continuidad:** escenario, subida o bajada de tensión, pasaje y avisos de canon.
  - **Acciones:** escribir el guion con IA, editar el guion, dividir o abrir las tomas, regenerar, bloquear o desbloquear, y subir o bajar la escena.
- **Inspector, cinco pestañas:**
  - Escena: campos editables, tensión y minutos.
  - Guion: el editor de guion existente, con historial, comparación y aprobación.
  - Escenario: elegir el escenario fijo y ver su ficha.
  - Canon: el pasaje y sus avisos.
  - Tomas: la lista con su estado.

  Las escenas bloqueadas (por ellas mismas, su secuencia o su acto) son de solo lectura.
- **Vistas:** Director, Secuencia (duración por escena, actos y tensión) y Guion (todo el proyecto en formato guion, por actos).
- **Pipeline:** Estructura → Guiones → Aprobados → Tomas → Storyboard → Vídeo → Aprobado → Montaje, todo con datos reales.
- **Guardado:** usa el `guardar` existente del proyecto, sin cambios de persistencia ni migraciones. Deshacer y rehacer funcionan por sesión.

### 3. Paneles redimensionables (`studio/Divisores.tsx`)

- **Dónde:** en los dos directores, entre el navegador y el lienzo y entre el lienzo y el inspector.
- **Cómo se usan:**
  - con el puntero, arrastrando (no selecciona texto mientras arrastras);
  - con el teclado, ←/→ en pasos de 16 px (48 px con Mayús) e Inicio/Fin;
  - doble clic para volver al ancho por defecto.
- **Accesibilidad:** cada divisor es un `role="separator"` con su valor actual.
- **Memoria:** el ancho se recuerda en el navegador para cada director.
- **Layout según el ancho del propio director:** usa *container queries*, porque el director puede vivir en una columna estrecha.
  - Por debajo de 1080 px: dos columnas, el inspector debajo y sin divisores.
  - Por debajo de 640 px: una columna, con el navegador en tira horizontal.

### 4. Transiciones del estudio

- **Al cambiar de pestaña:** el contenido nuevo entra una vez (opacity + 4 px), en todos los paneles con `role="tablist"`, en el contenido de las pestañas del episodio y en las vistas de los directores.
- **Otros elementos:**
  - los desplegables `details` se abren con la misma animación;
  - los avisos (`status`/`alert`) aparecen con fundido;
  - las tarjetas del inicio, las de las series y las de elección se elevan 2 px al pasar el cursor.
- **Movimiento reducido:** nada se anima con `prefers-reduced-motion` ni con la intensidad «Reducidos».

### Pruebas de la entrega 2

- `npm run typecheck` y `npm run lint` pasan, con los mismos 6 avisos de antes.
- `npm test`: 63 comprobaciones.
- `npm run test:e2e`: 26 flujos (6 nuevos del director largo):
  - se abre en el Director;
  - editar guarda la escena;
  - Alt+↑ mueve la escena y crea una versión;
  - no atraviesa una escena bloqueada y lo explica;
  - una escena bloqueada es de solo lectura;
  - «Abrir tomas» lleva a la escena correcta.
- El arrastre de los divisores se probó aparte en el navegador (de 260 a 315 px); los divisores no están en la batería de pruebas.
- Capturas (datos de prueba): [director corto](previews/aurora-director.jpg), [director largo](previews/aurora-director-largo.jpg), [secuencia larga](previews/aurora-secuencia-larga.jpg), [guion largo](previews/aurora-guion-largo.jpg).

### Pendiente

- Arrastrar escenas largas entre secuencias distintas (hoy solo se mueven dentro de su secuencia).
- Animaciones al reordenar (las tarjetas se recolocan sin interpolar la posición).
