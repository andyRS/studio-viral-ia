# Pautas para que Claude escriba un guion JSON importable en Estudio Viral

Copia todo lo que hay desde **«INSTRUCCIONES PARA CLAUDE»** hasta el final y pégalo en un chat nuevo de Claude.
Debajo, añade lo que quieres que escriba. Por ejemplo: «Escribe el ACTO I del tratamiento adjunto», y pega el tratamiento (`daniel-la-guerra-de-los-21-dias.md`).

Claude te devolverá dos archivos:
- `capitulo.json`
- `personajes.json`

Súbelos en la app de una de estas dos formas:
- **Nueva historia → «JSON del capítulo» + «JSON de personajes»**;
- en un episodio: **«Capítulo de otra IA»** + **«Importar personajes»**.

Usa el **modo fidelidad**: conserva el guion tal cual y el director de la app añade la dirección de cada toma (cámara, luz, acción, prompts 16:9).

---

## INSTRUCCIONES PARA CLAUDE

Vas a escribir el guion de una película épica bíblica para **Estudio Viral**, una app que convierte un guion en clips de vídeo con IA (Seedance 2.5, horizontal 16:9). La app importa **exactamente** dos archivos JSON con el formato de abajo. Si te sales del formato, la importación falla o pierde información.

### Cómo responder

1. Devuelve **solo dos bloques de código** `json`, en este orden: primero `capitulo.json` y después `personajes.json`. No añadas comentarios dentro del JSON: el JSON no admite comentarios.
2. Después de los dos bloques, añade una tabla corta con:
   - número de clip;
   - hablante;
   - número de palabras de la frase;
   - clase de fidelidad (cita / paráfrasis / inspirada / dramatización) con su referencia bíblica.
3. **Un archivo por acto, con un máximo de 80 clips.** Para una película de 30 minutos hacen falta unos 220 clips de 8 s, repartidos en 4 actos de 50 a 60 clips cada uno.
4. Si un acto no cabe en una respuesta, escríbelo en dos partes y espera a que te diga «sigue». No resumas ni te saltes clips.

### Archivo 1: `capitulo.json`

```json
{
  "titulo": "Daniel · La guerra de los 21 días — Acto I: La oración",
  "estilo": "epica",
  "gancho": [
    "Su oración fue escuchada desde el primer día...",
    "pero en el cielo, alguien le cerró el paso."
  ],
  "colores": {
    "Narrador": "F2F5FF",
    "Daniel": "F7D58A",
    "Mensajero Celestial": "FFF1C7",
    "Príncipe de Persia": "FF8656",
    "Azael": "B9F6CA"
  },
  "clips": [
    [["Narrador", "En el año tercero de Ciro, el cielo no estaba en silencio."]],
    [["Mensajero Celestial", "Traigo palabra del Altísimo para Daniel. Apártate."]],
    [["Príncipe de Persia", "Esta tierra es mía. Aquí no pasa tu luz."]],
    [["Daniel", "Señor, no comeré pan delicado hasta que me respondas."]]
  ],
  "tarjetas": [
    { "antes": 3, "texto": "SUSA · AÑO TERCERO DE CIRO" }
  ],
  "cierre": "DANIEL 10:12 · CONTINUARÁ",
  "versiculo": "Daniel 10:1–21"
}
```

**Reglas de `capitulo.json`:**

**Formato de los clips**
- `clips` es una lista. **Cada clip es una toma de vídeo de 8 s** y tiene **exactamente una frase de un solo hablante**: `[["Hablante", "frase"]]`. Nunca pongas dos frases ni dos hablantes en un mismo clip: el motor de vídeo solo hace hablar a un personaje por toma.
- **Longitud de la frase:** entre 6 y 18 palabras, para que quepa en 8 s y quede 1-2 s de acción o reacción después. Las frases de batalla, más cortas (4-10 palabras). Ninguna frase de más de 20 palabras.
- **Clips sin diálogo:** para una toma sin voz (por ejemplo, una carga de caballería), usa el narrador con una frase muy corta, o un grito o una orden del personaje («¡Ahora!», «¡Por el Altísimo!»). No dejes clips vacíos: la app los descarta.

**Nombres y colores**
- El **hablante** se escribe **exactamente igual** que en `personajes.json` (mismas mayúsculas y tildes). El narrador se llama siempre `"Narrador"`.
- En `colores`, una entrada por cada hablante: el nombre exacto y el color en hexadecimal de 6 cifras, **sin `#`**.

**Tarjetas, gancho y cierre**
- `tarjetas` son textos de salto de tiempo o de lugar («DÍA 7», «LLANURA DE DURA»). El campo `antes` **cuenta los clips desde 0**: `"antes": 3` sale justo antes del cuarto clip. Nunca uses un número igual o mayor que el total de clips del archivo. No pongas tarjeta antes del clip 0 (ahí va el título). Como mucho una cada 8-10 clips.
- `gancho`: dos líneas que despierten curiosidad. Se usan en las versiones verticales.
- `cierre`: la tarjeta final, en mayúsculas. `versiculo`: la referencia bíblica principal del acto.
- `estilo`: escribe siempre `"epica"`.

### Archivo 2: `personajes.json`

```json
{
  "titulo_serie": "Daniel: La Guerra de los 21 Días",
  "episodio": "Acto I — La oración",
  "formato": "16:9 horizontal",
  "estilo": "Épica bíblica (ángeles, cielo, relatos antiguos)",
  "fuente_principal": "Daniel 10:1–21; Daniel 3; Daniel 6",
  "narrador": {
    "nombre": "Narrador",
    "tipo": "voz_en_off",
    "descripcion": "Voz en off solemne y emotiva, español latino neutro; sin representación física.",
    "color_guion": "F2F5FF"
  },
  "personajes": [
    {
      "nombre": "Azael",
      "rol": "Joven escriba al servicio de Daniel; duda y al final cree.",
      "tipo": "personaje_en_pantalla",
      "descripcion_maestra": "Joven persa-hebreo de unos 19 años, delgado, piel oliva, ojos marrón oscuro, cabello negro corto y rizado, sin barba. Túnica de lino crema con faja azul índigo, bolsa de cuero con rollos y cálamo, sandalias de cuero. Mirada inquieta e inteligente.",
      "ambiente_referencia": "Casa de piedra y adobe en Susa; lámparas de aceite y luz de amanecer.",
      "formato_referencia": "16:9 horizontal (3840 x 2160 objetivo, si está disponible)",
      "estilo_visual": "Cine épico bíblico de acción real hiperrealista, fotografía cinematográfica premium, iluminación volumétrica, rostro reconocible y anatomía realista; no anime ni estética de videojuego.",
      "consistencia": "Usar la misma imagen maestra aprobada en cada toma; no reinventar rostro, silueta, vestuario ni paleta.",
      "participa_en_clips": [6, 7, 18, 19],
      "referencia_biblica": "Personaje inventado (dramatización).",
      "color_guion": "B9F6CA",
      "referencia_visual": null,
      "nota_fidelidad": "No aparece en la Biblia; sirve de interlocutor de Daniel."
    }
  ],
  "reglas_de_continuidad": [
    "Alas, armas, batallas celestiales y diálogos entre ángeles y príncipes son dramatización, no descripciones bíblicas literales.",
    "El Príncipe de Grecia aparece únicamente en el último clip del acto IV como anticipación.",
    "Conservar todos los personajes en proporción horizontal 16:9 con rostros visibles en las referencias maestras."
  ]
}
```

**Reglas de `personajes.json`:**

**Quién va en la lista**
- **Todos los hablantes** de `capitulo.json`, excepto el Narrador, tienen que estar en `personajes`, con el mismo nombre. También van los que **salen en pantalla sin hablar** (el león, el varón vestido de lino).
- Si te dan personajes ya aprobados, **copia su `descripcion_maestra` palabra por palabra** y no la cambies. Son las fichas con las que ya se generaron las imágenes. En esta película son: Daniel, Mensajero Celestial, Príncipe de Persia, Miguel, Príncipe de Grecia y Varón vestido de lino.

**La descripción visual (`descripcion_maestra`)**
- Escribe en **frases separadas por punto**.
- Incluye: edad aparente, complexión, piel, ojos, cabello, barba, y después **el vestuario con prendas concretas** (túnica, manto, armadura, cinturón, corona, espada, alas…). La app separa sola el vestuario del rostro por esas palabras.
- **Sin nombres de actores reales** y sin «como en tal película».
- **Ángeles y seres celestiales:** describe la luz y las alas o armadura con materiales físicos creíbles. **Antagonistas espirituales:** imponentes, pero no gore.

**Apariciones**
- `participa_en_clips` **cuenta los clips desde 1**. Ojo: es distinto de `tarjetas`, que cuenta desde 0.
- Pon ahí cada clip en que el personaje **se ve**, hable o no.
- Si un personaje **solo** debe salir en esos clips, escríbelo en su `rol` o en una regla con la palabra «únicamente» o «solo aparece». La app no lo pondrá en ninguna otra toma.

**Reglas y fidelidad**
- `reglas_de_continuidad`: incluye siempre la regla de que las batallas y los diálogos celestiales son dramatización. La app la usa para etiquetar esos diálogos como dramatizados y no como cita bíblica.
- `referencia_biblica` y `nota_fidelidad`: indica de dónde sale el personaje y qué parte es invención.

### Reglas de escritura (estilo viral épico)

**Estructura y ritmo**
- **La historia la llevan los diálogos.** El narrador solo aparece en la apertura, en el paso a un recuerdo y en el versículo final; como mucho 1 de cada 8 clips.
- **Empieza en la acción.** Los primeros 5-6 clips son ya el conflicto (la batalla, el peligro). Nada de presentar contexto al principio.
- **Montaje paralelo tierra/cielo.** Alterna bloques de 3-6 clips: Daniel orando ↔ la batalla. Cada bloque del cielo termina peor para el héroe, hasta la llegada de Miguel.
- **Batallas:** frases muy cortas, órdenes y respuestas. Cada clip, un golpe con consecuencia («Su espada se quiebra.» → «¡Ríndete!» → «Jamás.»).

**Biblia y emoción**
- **Versículos clave casi literales** (Reina-Valera 1909, dominio público). Puedes partirlos en varios clips seguidos del mismo hablante para que cada uno quepa en 8 s. Ejemplos: Daniel 3:17-18, 3:25, 6:22, 10:11-12, 10:20 y 12:1.
- **Libertad creativa sí, contradecir la Biblia no.** Puedes inventar escenas, personajes secundarios y diálogos que nazcan del texto. No cambies lo que dice: quién se salva, quién habla en el versículo, el resultado de cada milagro.
- **Emoción antes que explicación.** Cada 10-12 clips, un momento pequeño y humano: una mano que tiembla, una pregunta sin respuesta, un silencio.
- **El final de cada acto deja una pregunta abierta** («Ya es tarde.» / «Vi al cuarto hombre en el fuego.»).

**Prohibido**
- Diálogos de más de 20 palabras.
- Dos hablantes en un clip.
- Nombres de hablante que cambian («Gabriel» en un clip y «Mensajero Celestial» en otro).
- Comentarios dentro del JSON.
- Texto fuera de los dos bloques, salvo la tabla final.

### Comprobación antes de responder

- [ ] El JSON es válido: comillas dobles, sin comas finales, sin comentarios.
- [ ] Cada clip tiene una sola frase y un solo hablante, de 6 a 18 palabras (las de batalla, de 4 a 10).
- [ ] Todos los hablantes están en `colores` y en `personajes.json` con el mismo nombre (salvo el Narrador, que va en `narrador`).
- [ ] Las `tarjetas` cuentan desde 0 y `participa_en_clips` cuenta desde 1.
- [ ] El acto tiene como mucho 80 clips, y la suma de los actos ronda los 220.
- [ ] Las fichas aprobadas están copiadas sin cambios.
- [ ] La tabla final clasifica cada frase con su referencia.
