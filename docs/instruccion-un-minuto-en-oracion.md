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
