# Estudio Viral

Aplicación web para un creador de contenido de República Dominicana que produce microdramas con IA: **frutinovelas** (telenovelas animadas en 3D con personajes con cabeza de fruta), cine romántico estilo años 90, frutinovelas cristianas, y más adelante **dropshipping orgánico** con videos de productos.

- **Stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS, Supabase (base de datos + login por correo), API de un modelo de lenguaje (Claude u OpenAI) con la clave solo en variables de entorno.
- **Interfaz:** español, modo oscuro, responsive (pensada también para el celular).
- **Persistencia:** con sesión iniciada, **todos los módulos leen/escriben en Supabase filtrando por tu usuario**; sin sesión (o sin variables de Supabase) funciona en **modo local** con `localStorage` y los datos de ejemplo.
- **Rutas de IA protegidas:** `/api/generate`, `/api/analyze-metrics`, `/api/analyze-viral` y `/api/dropshipping` exigen sesión: sin login devuelven **401** sin llamar al modelo.

## Arquitectura de datos (Supabase por usuario vs modo local)

La capa de datos vive en `src/lib/DataContext.tsx` (contexto + `useData()`), con los mapeos cliente↔tabla en `src/lib/db.ts`. **Ningún módulo toca `localStorage` directamente**: todos usan `insert / update / remove` de `useData()`.

- **Con sesión (modo Supabase):** al montar, la app obtiene la sesión con el cliente de navegador de `@supabase/ssr`. Todo se lee con `.eq("user_id", auth.uid())` y todo insert lleva `user_id`; update/delete filtran por `id` **y** `user_id`. La RLS de `supabase/schema.sql` impone lo mismo en la base de datos (política `own rows`: `auth.uid() = user_id`), así un usuario jamás ve datos de otro aunque manipule el cliente. Colecciones conectadas: `accounts`, `series`, `characters`, `formulas`, `episodes` (el Generador guarda el episodio con `platform_adaptations` y `versions`), `production_cards`, `clip_checks`, `costs`, `calendar_entries`, `metrics` (las métricas específicas de cada plataforma 4B van en la columna `extra jsonb`), `viral_analyses`, `products` y `product_tests`. Las mutaciones refrescan el estado al instante y hay suscripción Realtime (si está activa en tu proyecto) que recarga ante cambios externos.
- **Primer login (seed por usuario):** se guardan las fórmulas base si faltan. Las series, personajes, cuentas y métricas empiezan vacíos.
- **Sin sesión (modo sin login):** mismos módulos y mismas operaciones, pero contra `localStorage` con los datos de ejemplo. Ideal para probar sin configurar nada.
- **Indicador de modo (siempre visible en el panel):** `🟢 Conectado: tu@correo (Supabase)` con botón **Salir**, o `🟡 Modo sin login (datos locales)`. La página principal es usable en ambos modos.

## Protección de las rutas de IA (401)

`src/middleware.ts` (con `@supabase/ssr`) refresca la sesión en cookies en cada petición, para que el servidor la vea. Cada ruta de IA empieza llamando `requireUser()` (`src/lib/auth-guard.ts`), que crea el cliente de servidor desde las cookies y ejecuta `auth.getUser()`:

- **Sin usuario → `401 {"error":"No autorizado: inicia sesión"}`** y la ruta **no** llama al LLM (se responde antes de parsear el cuerpo y de cualquier generación).
- **Sin variables de Supabase en el servidor → `503`** con el mensaje de que Supabase no está configurado: las rutas quedan cerradas, nunca abiertas por falta de configuración.
- **Con usuario →** la ruta procesa normal (con `LLM_API_KEY` usa el modelo; sin ella, responde la plantilla local del servidor).

En el frontend, Generador, Métricas (Analizar), Analizador y Dropshipping detectan el 401/503 y muestran **«Inicia sesión para usar la IA»** con enlace a `/login`, sin romperse. En modo sin login ofrecen la **plantilla local en el cliente** (misma salida, generada en el navegador) dejando claro que la API protegida requiere login.

> Verificado: con un `.env.local` de placeholders bien formados, `curl -X POST` **sin sesión** a las 4 rutas devuelve **401** en las 4; sin variables de Supabase devuelve **503** en las 4; la página principal responde 200.

## Módulos

1. **Cuentas** — nombre, plataforma (**Instagram, Facebook, TikTok, YouTube Shorts**), nicho, público y duración ideal.
2. **Personajes** — biblia por serie con fruta, cabeza, ropa, voz y prompt de Flow persistentes. La ficha visual se sube, se versiona y se aprueba antes de producir.
3. **Fórmulas virales** — biblioteca editable, precargada con la Fórmula Base, el formato TikTok/Facebook 1-3 min y el formato cristiano.
4. **Generador de episodios** — escenas de 8 s con imagen y clip por escena. Si Gemini falla, la plantilla se guarda como **Borrador** y no habilita producción. La versión corta de Dola conserva el gancho y el cierre. Cada episodio guarda la versión de las fichas maestras empleadas.
5. **Producción** — mesa ligera en cada episodio con imagen, prompt, clip y revisión; carga por lote `s01`, `s02`…, motivo para rehacer y montaje al aprobar todas las escenas. El Kanban y costos siguen disponibles.
6. **Calendario** — semanal por cuenta, meta de 1-2 publicaciones diarias, aviso de días sin contenido.
7. **Métricas** — vistas, reproducción promedio, interacciones y seguidores por video; comparación 4B. «Continuar una serie» muestra las vistas registradas por parte y plataforma y solo sugiere una Parte 1 nueva con caídas y ventanas de observación comparables.
8. **Analizador de virales** — pega una transcripción y el LLM devuelve la estructura y la guarda como fórmula nueva.
9. **Dropshipping orgánico** — ficha de producto con margen calculado, 5 ángulos, 3 guiones de 15-30 s, prompt Seedance 2.5 y landing completa; registro de probados y ganadores.

## 4B. Adaptación por plataforma (OBLIGATORIO)

> **Regla: toda historia se construye primero con la FÓRMULA BASE (Instagram) y después se generan 4 versiones, una por plataforma. Nunca el mismo archivo ni el mismo texto en todas.**

**FÓRMULA BASE (Instagram)** — el origen de todo:

- Conflicto / estatus visible en el **segundo 0-1**, sin presentaciones.
- Gancho en texto: **2 líneas en los primeros 3 segundos**.
- **Revelación mediante un objeto**: una entrada, una carta, un celular, una prueba de embarazo.
- Escalada rápida + giro / cliffhanger.
- Estética cinematográfica, primeros planos de reacciones.
- Cierre **«Continuará...»** + **«¿Parte 2?»** en comentarios.

El generador (`src/lib/llm.ts` + `src/lib/platforms.ts`, API `POST /api/generate`, componente *Generador*) entrega **4 fichas separadas**, cada una con duración recomendada, cambios de montaje, texto de portada, título/descripción, hashtags, mejor horario, frecuencia, CTA, métricas a vigilar, checklist y **nombre de archivo propio**, con su botón **Copiar**:

| Plataforma | Duración | Claves de la ficha |
|---|---|---|
| **Instagram Reels** | 30-60 s | Cortes cada 2-4 s. Portada: cara en primer plano + 1 frase de intriga. Descripción corta con pregunta + **«Comenta PARTE 2»**. 3-5 hashtags de nicho. Recordatorio: activar la etiqueta **«Información de IA»**. Métricas: **compartidos, guardados, seguidores**. |
| **Facebook** | 60-90 s | Diálogo sin pausas. **Subida nativa, nunca desde Instagram**. Gancho visible **5-8 s**. Descripción emotiva / de debate: **«¿Quién tiene la culpa?»**. Sugerencia de **3 grupos de Facebook dominicanos con una frase para compartir en cada uno** (verifícalos antes de publicar). Publicar **1/día, 7-10 pm (hora RD)**. Métricas: **tiempo promedio, vistas de 1 minuto, ingresos estimados**. |
| **TikTok** | 1-3 min (**>1 min monetiza**) | **«Anteriormente...» de 5-8 s** si es continuación. Tarjetas de tiempo + **narrador solo en la última frase**. Portada **«PARTE X» grande + título de la serie**. Descripción con keywords buscables (**frutinovela, telenovela de frutas, drama dominicano**) + 3-5 hashtags. **Playlist por serie**. **1-2/día**. **Respuestas en video** a comentarios. Métricas: **% visto completo, nuevos seguidores, búsquedas**. |
| **YouTube Shorts** | Hasta 3 min, **ideal 45-90 s** | Final que **empalma con el inicio para hacer bucle**. Título con keywords + **#shorts, máximo 60 caracteres**. **Sin marcas de agua, archivo limpio**. Vincular la siguiente parte con **«video relacionado»**. Métricas: **visto vs deslizado, retención**. |

**Dónde se guarda:** cada episodio guarda sus 4 fichas en el campo **`platform_adaptations` (`jsonb`)** de la tabla `episodes` en Supabase (en modo local: `episodes[].platform_adaptations` en `localStorage`). En el generador también puedes descargarlas como `adaptaciones-plataformas.json`.

**Comparación en Métricas:** el módulo 7 incluye un **tablero de comparación del mismo episodio lado a lado en las 4 plataformas**, y cada una se juzga con sus propias métricas 4B (no solo por vistas).

**YouTube Shorts** también es plataforma seleccionable al registrar una **Cuenta**.

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta `supabase/schema.sql` para un proyecto nuevo. Para un proyecto ya desplegado, ejecuta `supabase/migrations/20261022_character_bible_scene_review.sql` antes de publicar esta versión; añade las columnas nuevas sin borrar filas existentes.
3. En **Authentication → Providers → Email** deja activo el login por correo. La pantalla está en `/login`.
4. Copia la URL del proyecto y las claves desde **Project Settings → API**.

### 2. Variables de entorno

Copia `.env.example` a `.env.local` y rellena:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
LLM_API_KEY=
LLM_PROVIDER=anthropic   # anthropic | openai
LLM_MODEL=claude-3-5-sonnet-latest   # o gpt-4o-mini si usas OpenAI
```

> **Nota honesta:** las rutas de IA exigen login (ver «Protección de las rutas de IA»). Sin `LLM_API_KEY` (pero con sesión) el generador, el analizador y dropshipping responden con la **plantilla local del servidor** (sin IA). En modo sin login, la plantilla se genera en el cliente y los datos van a `localStorage`.

### 3. Ejecutar

```bash
npm install
npm run dev
# http://localhost:3000
```

### 4. Despliegue en Vercel

1. Sube el proyecto a GitHub e impórtalo en [vercel.com](https://vercel.com) (framework: Next.js, sin configuración extra).
2. Agrega las mismas variables de entorno en **Settings → Environment Variables**.
3. Deploy. Recuerda agregar la URL de Vercel en Supabase → Authentication → URL Configuration (Site URL / Redirect URLs).

## Estructura

```
src/lib/platforms.ts        # 4B: FÓRMULA BASE + buildPlatformAdaptations() (4 fichas)
src/lib/llm.ts              # callLLM (Claude/OpenAI) + generateEpisode() + plantillas locales (servidor y cliente)
src/lib/seed.ts             # Serie y personajes de ejemplo + fórmulas precargadas
src/lib/db.ts               # Mapeos colección <-> tabla Supabase / clave localStorage
src/lib/DataContext.tsx     # Sesión + capa de datos (Supabase por usuario | modo local) + SessionBar + Salir
src/lib/auth-guard.ts       # requireUser(): 401 sin sesión / 503 sin Supabase configurado
src/lib/api-client.ts       # postApi() del frontend (detecta 401/503)
src/middleware.ts           # Refresco de sesión en cookies (@supabase/ssr)
src/lib/supabase/           # Cliente navegador y servidor (@supabase/ssr)
src/app/api/generate/       # Generador (incluye platformAdaptations) — protegida
src/app/api/analyze-metrics/ src/app/api/analyze-viral/ src/app/api/dropshipping/  # protegidas
src/components/             # Los 9 módulos + PlatformAdaptations.tsx (fichas 4B)
supabase/schema.sql         # Esquema + RLS + migración 4B + metrics.extra
```
