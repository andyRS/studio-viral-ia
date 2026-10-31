# Instrucción de trabajo · Un Minuto en Oración (drama bíblico moderno)

Objetivo: microdramas virales con IA para la cuenta cristiana de Andy (TikTok @unminutodeoracion2026 + Facebook «Un Minuto en Oración»), con historias que escalen en variedad: toda la gama de la Biblia llevada a la vida de hoy en República Dominicana, cada una con un gran mensaje.

En la app: estilo **«Drama bíblico moderno (personas reales)»** (`biblica`) y perfil de cuenta con el botón **Publish & Grow → Cuentas → «Cargar Un Minuto en Oración»**.

## 1. Idea central
Historia bíblica (o principio bíblico) contada como drama dominicano moderno. El público siente «esto me pasó a mí» y recién al final descubre el versículo y el mensaje. Primero la emoción, luego la verdad.

## 2. Banco de historias (rotar tipos)
Está en `src/lib/knowledge.ts` → `BIBLE_BANK` (historia, versión RD, mensaje y versículo). La IA recibe las historias ya usadas en la cuenta para no repetir.

## 3. Estructura de cada vídeo
0-3 s gancho con conflicto visible y texto de 2 líneas · estatus y contraste · objeto que revela · escalada con frases de 2-6 palabras, un hablante por clip · giro · cierre emotivo con el mensaje del Narrador · versículo en pantalla los últimos 3 s (tarjeta final del montaje). Cada vídeo se entiende solo.
Duración: 14 escenas por defecto (~64 s tras quitar pausas), porque 10 escenas quedan en ~45 s y Facebook pide 60 s para monetizar.
**Pendiente:** ajustar esta sección con los tiempos reales del vídeo de referencia de TikTok («Negó a su propia madre…», 2.025 vistas, ~10× el promedio de la cuenta), que no se pudo descargar desde la nube.

## 4. Reglas obligatorias
- Nunca santos, Virgen, altares, velas votivas ni rosarios; iglesia evangélica sencilla (en todos los prompts: «No saints, no Virgin, no altars, no votive candles, no rosaries, plain evangelical church, plain empty cross»).
- Nunca el nombre de Dios en vano ni violencia gráfica; vestuario modesto de manga larga.
- Español latino neutro, palabras completas; dominicanismos completos solo si aportan.
- Prompt de vídeo: empieza con «Usa Seedance 2.5.» y termina con «Español latino neutro, cada palabra completa, nunca acento inglés. Sin música, sin subtítulos ni texto en pantalla.»
- Un solo personaje habla por clip. No prometer milagros ni curas reales. Marcar «Contenido de IA».

## 5. Plataformas
- TikTok: 1-2 min, gancho en 3 s, descripción corta + 3-5 hashtags.
- Facebook: mínimo 60 s, 7-10 p. m.; «Título · Parte N» solo si hay serie. **Nunca** «comenta AMÉN», «dale like», «sígueme» ni «comparte» (Meta lo penaliza). Pregunta abierta en el texto sin pedir acción.
- Instagram/Shorts: corte de 25-46 s solo si Andy lo pide. Cada plataforma con su archivo y su texto.

## 6. Entregable por historia
Ficha (título, versículo, mensaje, personajes con color), guion de escenas, prompts de imagen (inglés) y de vídeo por escena, cadena de continuidad (botón «Último fotograma → sNN» en la mesa de escenas), guion.json con versículo para el montaje, textos por plataforma. Cotizar créditos antes de generar; nunca gastar sin el OK de Andy.

## 9. Control de calidad
La revisión automática del montaje comprueba: llamadas a interacción en pantalla o en el diálogo, versículo en la tarjeta final, duración ≥ 60 s para Facebook, pausas, ritmo, orden de clips y voz en cada clip.

---

# PISTA B · Épica bíblica (ángeles, cielo, libros apócrifos)

En la app: estilo **«Épica bíblica (ángeles, cielo, relatos antiguos)»** (`epica`). Comparte con la Pista A el versículo en la tarjeta final, el mensaje del Narrador, las reglas pentecostales y la prohibición de llamadas a interacción.

- **Solo lo bíblico (decisión de Andy, 31 oct. 2026):** personajes bíblicos con su nombre del relato (y ángeles, profetas, reyes, soldados de la época) en escenarios que la Biblia menciona o épicos de ese tiempo (Jerusalén, Babilonia, Dotán, Betel, el Jordán, el desierto, el horno, el foso, el cielo abierto), con vestuario de entonces y español latino neutro y solemne. Nada dominicano ni moderno: ni nombres, ni acento, ni objetos, ni teléfonos. Se quitó el modo B-Puente (ángeles en la RD de hoy); esas historias, si se hacen, van en la Pista A.
- **Banco:** `EPIC_BANK` en `src/lib/knowledge.ts` (2 Reyes 6:16, Daniel 10:12, Génesis 28:16, Daniel 3:25, 2 Reyes 2:11, Génesis 21:17 Agar, Hechos 12:7 Pedro, Isaías 14:12, Génesis 5:24 Enoc).
- **Estructura (B5):** 0-3 s imagen impactante + texto de 2 líneas → humano en crisis → revelación de lo invisible → clímax de fe e intervención → cierre en calma con el mensaje y el versículo. Por defecto 12 escenas de 5 s.
- **Prompts (v16):** «Cinematic epic, anamorphic lens flare, volumetric light, 35mm grain, vertical 9:16, photorealistic» + negativo «no saints, no Virgin, no halos, no altars, no votive candles, no rosaries, no cartoon cherubs, no gore»; nunca el rostro de Dios ni de Jesús (solo luz, voz, sombras, manos de luz; Cristo de espaldas o como luz); ángeles altos sin halos; gigantes y caídos como siluetas; planos cerrados si la multitud no se anima bien. Mismo inicio («Usa Seedance 2.5.») y la misma línea final que la Pista A.
- **Apócrifos (Enoc, Jubileos):** siempre «inspirado en la tradición de Enoc», nunca como Palabra de Dios; puente con Judas 14-15 y Génesis 5:24; sin inventar doctrina ni magia; el mensaje: Dios es justo y cuida al que camina con Él. La ficha avisa cuando el relato es apócrifo.
- **Descripción:** siempre termina con «Historia inspirada en textos antiguos. Contenido de IA, ficción.»
- **Créditos:** los efectos grandes cuestan más; cotizar antes y generar primero escenas de 5 s en 480p, y subir a 720p solo las clave (la app no gasta créditos: se genera en Flow).
- **Calendario del perfil:** jueves y domingo, Pista B.
