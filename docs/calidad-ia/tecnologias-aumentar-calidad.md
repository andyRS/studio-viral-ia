# Aumentar la calidad con IA: las tecnologías más potentes para un motor propio

Revisión de noviembre de 2026, pensada para el PC de Estudio Viral: **RTX 4060 con 8 GB** y Windows.
Solo tecnologías que se pueden instalar en tu PC (sin pagar por vídeo) y cuya licencia permite usarlas en contenido monetizado.
Licencias comprobadas en los repositorios oficiales y en Hugging Face.

## Lo que hay hoy, por categorías

### 1. Restauración de vídeo con difusión (lo más potente que existe en abierto)

| Tecnología | Qué hace | Licencia | ¿Funciona en la 4060 (8 GB)? |
|---|---|---|---|
| **SeedVR2** (ByteDance, versiones 3B y 7B) | Restaura y escala el vídeo **entero en un solo paso de difusión**: reconstruye texturas, pelo, tela y caras, con **coherencia entre fotogramas** (no parpadea). Hoy es la referencia de calidad en abierto. | Apache 2.0 | **Sí, con el modelo 3B cuantizado** (GGUF o FP8) y «BlockSwap» (pasa bloques a la RAM). Existe una herramienta de línea de comandos que procesa por trozos (`--chunk_size`) y une los trozos con solapamiento. Es lenta: para escenas clave o el montaje final. |
| **FlashVSR v1.1** (actualizado en octubre de 2026) | Escalado con difusión en streaming, pensado para ir casi en tiempo real (unos 17 fps en una A100). | Apache 2.0 | **Dudoso.** Su atención dispersa solo está probada en A100/H200; en las RTX 40 el propio proyecto dice que es «desconocido». Hay versiones de la comunidad con menos VRAM. Para vigilar, no para integrar ya. |
| STAR, Upscale-A-Video | Escalado con modelos de vídeo grandes. | STAR sin licencia clara; Upscale-A-Video no comercial (S-Lab) | Demasiado pesados para 8 GB o con licencia problemática. **Descartados.** |

### 2. Escalado clásico con IA (rápido, fotograma a fotograma)

| Tecnología | Qué hace | Licencia | En la 4060 |
|---|---|---|---|
| **Real-ESRGAN** (x2plus, x4plus, *realesr-general-x4v3*) | Escala y limpia compresión y ruido. La *general-v3* es ligera y tiene un control para limpiar el ruido. Es la IA de fondo que usaba el cuaderno de Colab. | BSD-3 | **Sí, y rápido**, en ONNX con la misma librería que ya usamos (onnxruntime). Puede parpadear un poco porque no mira los fotogramas vecinos. |
| RealBasicVSR / BasicVSR++ | Escalado que sí mira los fotogramas vecinos. | Apache 2.0 | Funciona, pero SeedVR2 la supera claramente. No compensa. |

### 3. Rostros

| Tecnología | Licencia | Estado |
|---|---|---|
| **GFPGAN 1.4** | Apache 2.0 | **Ya integrado** (Herramientas → Mejorar con IA). |
| CodeFormer | **S-Lab: solo uso no comercial** | **No usar:** tus páginas están monetizadas. |
| RestoreFormer++, GPEN | Revisar caso por caso | Alternativas si GFPGAN se queda corto. |

### 4. Fluidez (interpolar fotogramas)

| Tecnología | Licencia | Uso |
|---|---|---|
| **RIFE** (Practical-RIFE) | MIT | Rápido. Sirve para suavizar clips con tirones o para hacer cámara lenta limpia. **No conviene** pasar una película de 24 a 60 fps: pierde el aspecto de cine. |

### 5. Opciones cerradas (como referencia)

- **NVIDIA RTX Video Super Resolution / Video Effects SDK:** muy rápido en tu tarjeta (usa los Tensor Cores) y gratis, pero es un SDK cerrado con sus propias condiciones y solo para Windows. Es posible integrarlo, pero dependes de NVIDIA.
- **Topaz Video AI:** de pago y cerrado. Sirve como vara de medir, no como motor propio.

## Propuesta: «Motor de calidad Estudio Viral» en tres niveles

| Nivel | Para qué | Cadena | Tiempo aproximado |
|---|---|---|---|
| **Rápido** | Cada clip antes de montar | Real-ESRGAN *general-v3* (limpia y escala a 1080p) → GFPGAN en las caras (ya está) | Segundos por clip |
| **Cine** | Escenas clave y el montaje final de las películas largas | **SeedVR2 3B** (GGUF/FP8 + BlockSwap, por trozos con solapamiento) → color y grano del montaje | Lento: dejarlo trabajando (de noche, por partes) |
| **Fluidez** (opcional) | Clips con tirones o cámara lenta | RIFE | Segundos |

**Orden recomendado para construirlo:**
1. **Real-ESRGAN** en «Mejorar con IA» (fondo además de caras) y como opción del montaje. Es fácil: misma librería que ya usamos y un modelo de pocos MB.
2. **SeedVR2 como «Modo cine»** en tu PC: se instala aparte (PyTorch con CUDA, el modelo 3B cuantizado) y se lanza por trozos con progreso, como el borrado con IA. Antes de integrarlo, prueba de velocidad y calidad con un clip real de Daniel en tu 4060.
3. **RIFE** solo si aparecen clips con tirones.
4. **FlashVSR:** revisar cuando confirmen que funciona en RTX 40.

**Cuidado con:**
- **La identidad de las fichas.** Las IA de difusión pueden cambiar rasgos. Probar siempre con los primeros planos de los personajes canónicos y comparar con la ficha antes de pasarlo a toda una película.
- **Los 8 GB de VRAM.** Nada de modelos 7B sin cuantizar; trabajar por trozos.
- **Las licencias.** Solo Apache, MIT o BSD para contenido que se monetiza.
