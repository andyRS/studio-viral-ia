# Agentes de Estudio Viral (OpenCode + DeepSeek V4.1)

Dos agentes que **ejecutan** y Claude, que **revisa**:

| Agente | Qué hace | Dónde escribe | Qué puede ejecutar |
|---|---|---|---|
| **guionista** | Guiones, capítulos y fichas de personajes en el JSON que importa la app; los valida antes de entregarlos | `trabajo/guiones/<proyecto>/` | Solo el validador y `git add` / `git commit` (el push te lo pregunta) |
| **buscador** | Vídeos, fotos y fondos con licencia libre (Pexels, Pixabay, Wikimedia Commons) para editar | Los archivos en `Descargas\EstudioViral\<proyecto>\`; el manifiesto de licencias y la hoja de contacto en `trabajo/material/<proyecto>/` | Solo `scripts/material/descargar.mjs` y `git add` / `git commit` |
| **Claude** (el cerebro) | Revisa cada entrega: guion, fidelidad bíblica, personajes, licencias y calidad del material. Aprueba o pide cambios | `revision.md` en la carpeta de cada entrega | Todo (en su sesión) |

Modelo: **`opencode/deepseek-v4.1-flash-free`**, el **DeepSeek V4.1 Flash gratis** que ofrece OpenCode («Modelos gratuitos proporcionados por OpenCode»). No necesita clave de DeepSeek ni cuesta dinero.
- Si algún día el gratuito va lento o tiene límite, cambia el `model:` de `.opencode/agents/guionista.md` y `buscador.md` por `deepseek/deepseek-flash`, que es el mismo modelo pagando directamente a DeepSeek con tu `DEEPSEEK_API_KEY`.
- Para guiones de más calidad, `deepseek/deepseek-v4-pro`, también de pago.

## Instalación en Windows (una vez)

1. **OpenCode:** `npm install -g opencode-ai` (necesitas Node 18 o superior; ya lo tienes por la app).
2. **Modelo:** no hace falta clave, porque se usa el DeepSeek V4.1 Flash gratis de OpenCode. Solo si cambias al de pago: `setx DEEPSEEK_API_KEY "sk-..."` (se crea en https://platform.deepseek.com).
3. **Claves gratis del buscador (opcionales pero recomendadas):**
   ```powershell
   setx PEXELS_API_KEY "..."     # https://www.pexels.com/api/
   setx PIXABAY_API_KEY "..."    # https://pixabay.com/api/docs/
   ```
   Sin ellas, el buscador usa solo Wikimedia Commons.
4. Comprueba que está todo:
   ```powershell
   cd "C:\tmp\Estudio Viral IA"
   git pull
   opencode agent list      # deben salir guionista y buscador
   opencode models opencode # debe salir opencode/deepseek-v4.1-flash-free
   ```

## Uso diario

**Con la interfaz:** en la carpeta del proyecto ejecuta `opencode`, pulsa **Tab** hasta que salga *guionista* o *buscador* y escribe el encargo.

**Directo desde la terminal:**
```powershell
opencode run --agent guionista "Escribe el ACTO I de docs/peliculas/daniel-la-guerra-de-los-21-dias.md en trabajo/guiones/daniel-21-dias"
opencode run --agent buscador "Para trabajo/guiones/daniel-21-dias: planos de lugar de desierto al amanecer, río ancho antiguo y cielo de tormenta, 1080p, proyecto daniel-21-dias"
```

## Pedírselo a Claude (él lanza los agentes)

Puedes pedírselo todo a Claude en el chat, y Claude lanza los agentes desde su sesión en la nube:

- **Guionista:** Claude ejecuta `opencode run --agent guionista --model deepseek/deepseek-flash "…"`, revisa el resultado y lo sube a GitHub. Tú solo haces `git pull`.
- **Buscador:** Claude elige el material y sube el manifiesto. En tu PC ejecutas una sola orden para que se descargue en Descargas:
  ```powershell
  git pull
  node scripts/material/descargar.mjs bajar --proyecto <proyecto>
  ```

**Requisito:** el modelo gratuito de OpenCode no funciona desde la nube; responde «Free usage limit reached». Por eso la sesión de Claude necesita una clave de pago en la configuración del entorno (menú del entorno en la barra de título de la sesión → *Edit* → *Network secrets* o variables de entorno):
- `DEEPSEEK_API_KEY` (de https://platform.deepseek.com) para DeepSeek V4.1 Flash;
- opcionales para el buscador: `PEXELS_API_KEY` y `PIXABAY_API_KEY`.

La sesión nueva la recoge sola. Nunca pegues la clave en el chat.

En tu PC puedes seguir usando el modelo gratuito con `opencode` como siempre.

## El ciclo con Claude

1. El agente termina y hace commit de su carpeta. **Tú haces `git push`** (el agente no puede hacerlo sin tu permiso).
2. Le dices a Claude: *«Revisa trabajo/guiones/daniel-21-dias»* o *«Revisa el material de daniel-21-dias»*.
3. Claude:
   - pasa el validador y el importador de la app sobre el guion;
   - revisa la historia, la fidelidad bíblica, el ritmo viral y que las fichas aprobadas no cambien;
   - en el material, revisa licencias, atribuciones, resolución y la hoja de contacto;
   - deja `revision.md` con **«Aprobado»** o con la lista exacta de cambios.
4. Si hay cambios, se los pasas al agente: *«Aplica trabajo/guiones/daniel-21-dias/revision.md»*.
5. Con «Aprobado», importas el guion en la app (Nueva historia → JSON en modo fidelidad) o usas el material en la mesa de escenas.

## Reglas que los agentes no se pueden saltar

- Solo escriben en su carpeta. No tocan el código de la app.
- El buscador solo descarga de Pexels, Pixabay y Wikimedia Commons (en Wikimedia, solo dominio público, CC0, CC BY y CC BY-SA). **Nada de YouTube, TikTok, Instagram, Facebook ni películas**; no usa yt-dlp ni se salta protecciones.
- Los vídeos descargados no se suben al repositorio (solo el manifiesto y la hoja de contacto).
- No gastan créditos de generación de vídeo o imagen, y con el modelo gratuito tampoco tokens de pago.
