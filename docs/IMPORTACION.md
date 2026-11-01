# Importación cinematográfica de capítulos externos

Flujo: Nueva historia → Subir capítulo de otra IA → (personajes canónicos) → Crear serie y episodio 1.

## Causas encontradas (Daniel EP01: 20 clips → 21 escenas, 95 s)
1. **Cierre del Narrador forzado** en estilos bíblicos (`production.ts`, `buildProduction`): si la última frase no era del
   Narrador se añadía «Lo que el hombre rompe, Dios lo puede restaurar.». La IA recibía la misma orden (`sceneBrief`:
   «la última escena es del Narrador») y `validateEpisode` rechazaba un final sin Narrador. Con 21 escenas configuradas:
   21 escenas y 95 s (21 × 4,5). Con 20: se descartaba un clip original para dejar la conclusión inventada.
   `gancho`, `tarjetas` y `cierre` NO creaban escenas (comprobado con y sin metadatos).
2. **`clips` no se reconocía como capítulo** (`capituloDeJson` exigía `scenes`): el archivo iba a la adaptación con IA,
   que reescribe diálogos.
3. **`descripcion_maestra` no se leía**: las fichas salían con el relleno genérico; `tipo`, `participa_en_clips` y
   `reglas_de_continuidad` se ignoraban.
4. **Presencia visual = quien habla**: las escenas del Narrador salían «NOBODY in the scene» (escena 15: solo luces
   sobre el río) y la emoción de la escena se añadía igualmente al prompt (gestos sin dueño).
5. **Hablante desconocido → primer personaje del elenco** (`findSpeaker`).

## Diseño
`src/lib/importacion.ts`
- `normalizarCapitulo`: `clips` (pares hablante/frase, un clip con varias frases = varias escenas) o `scenes`;
  tarjetas convertidas a índice desde 0 si el archivo cuenta desde 1.
- `normalizarPersonajes`: `personajes`, `descripcion_maestra`, `tipo`, `participa_en_clips`, `reglas_de_continuidad`,
  `narrador` (voz en off, sin ficha visual). Restricciones («aparece únicamente…») → `soloEnApariciones`.
- `asignarPresencia`: `speaker` ≠ `visibleCharacters`. Fuentes: quien habla (salvo Narrador), apariciones explícitas,
  personajes nombrados en la narración (no en diálogos), continuidad para narraciones sin nombre (con aviso).
  Las restricciones se aplican siempre.
- `dirigirEscena`: plano, cámara, acción estática (imagen) y acción/movimiento (vídeo), luz, ambiente, VFX, expresión,
  conflicto, continuidad, sonido; variaciones para momentos repetidos.
- `validarImportacion`: personajes desconocidos, canónicos sin aparición, narrador en cuadro o con rostro,
  restricciones, escenas sin acción, duración, referencias faltantes, cambios de diálogo, formato.
- Modo **fidelidad** (`importarFiel`, `/api/importar`): diálogos, hablantes, orden y cantidad intactos; la IA (si hay)
  solo propone dirección visual y se filtra (no puede tocar frases ni poner en cuadro al Narrador o a un restringido).
  Modo **creativo** (`/api/series`): reescritura con IA y lista de cambios respecto al original.

Los episodios existentes no se modifican; los campos nuevos de escena son opcionales.
Pruebas: `tests/importacion.test.ts` (fixtures reales en `tests/fixtures/`) y e2e sección 14.
