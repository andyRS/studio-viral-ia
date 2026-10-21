# Montaje automático — Estudio Viral

Monta un episodio a partir de los clips generados (Dola, Higgsfield…) y su `guion.json`:
une los clips en 1080x1920, quema subtítulos karaoke con el color de cada personaje,
pone el gancho los primeros 3 s, las tarjetas y el cierre, y quita la marca de agua de Dola.

## Archivos
- `subtitular.py` — el script de montaje (se puede usar solo por línea de comandos).
- `server.py` — API HTTP (FastAPI) que envuelve el script.
- `Dockerfile` — imagen con ffmpeg, faster-whisper y el modelo `small` ya descargado.
- `fonts/Poppins-Bold.ttf` — tipografía de los subtítulos (licencia OFL).

## Formato de guion.json
```json
{
  "colores": {"Manguito": "FF9A1F", "Chinola": "C08BFF"},
  "gancho": ["Línea 1 del gancho...", "línea 2"],
  "cierre": "Continuará...",
  "delogo": "x=603:y=1232:w=104:h=36",
  "clips": [
    [["Chinola", "Manguito... ¿quién es esta señora?"], ["Manguito", "..."]],
    [],
    [["Manguito", "..."]]
  ]
}
```
- Un bloque por clip, en el mismo orden en que se envían los clips.
- `[]` = clip sin diálogo (por ejemplo una tarjeta "Un año después...").
- Los nombres de `colores` deben coincidir exactamente con los hablantes.
- Colores en hex **sin** `#`.
- `delogo` es opcional: solo para clips de Dola de 720x1280.

## Uso por línea de comandos
```
python3 -I subtitular.py guion.json salida.mp4 clip1.mp4 clip2.mp4 ...
```

## API
- `GET /salud` → `{"ok": true}`
- `POST /montar` (multipart): campo `guion` (archivo) y uno o varios campos `clips` (en orden).
  Autorización (si se configuró `MONTAJE_TOKEN`), una de dos:
  - `Authorization: Bearer <MONTAJE_TOKEN>` — para curl o scripts propios.
  - `Authorization: Ticket <exp>.<firma>` — pase temporal (15 min) que firma la app en
    `/api/montaje` con HMAC-SHA256 de `montaje:<exp>` usando el mismo `MONTAJE_TOKEN`.
    Así el token real nunca llega al navegador.
  Responde el `.mp4` final.

Ejemplo:
```
curl -F guion=@guion.json -F clips=@c1.mp4 -F clips=@c2.mp4 -H "Authorization: Bearer TU_TOKEN" https://tu-servidor/montar -o episodio.mp4
```

## Variables de entorno
- `MONTAJE_TOKEN` — obligatorio en producción, para que nadie más use el servidor.
- `ALLOWED_ORIGINS` — p. ej. `https://studio-viral-ia.vercel.app`.
- `WHISPER_MODEL` — `small` por defecto (más preciso: `medium`, más lento y con más RAM).
- `X264_PRESET` — `medium` por defecto (`veryfast` = más rápido, archivo más grande).

## Despliegue (Railway / Render / Fly.io)
1. Sube esta carpeta a un repositorio y créalo como servicio con **Dockerfile**.
2. Define `MONTAJE_TOKEN` y `ALLOWED_ORIGINS`.
3. Plan con **al menos 2 GB de RAM**.
4. Tiempo de referencia: ~3 min por un episodio de 48 s (3 clips) en una CPU modesta. Por eso la app debe esperar la respuesta con un indicador de progreso, o usar un timeout largo.

## Conexión con la app (Vercel)
En Vercel → Settings → Environment Variables:
- `MONTAJE_URL` — URL pública de este servidor, sin `/` final (p. ej. `https://montaje-xxxx.up.railway.app`).
- `MONTAJE_TOKEN` — el mismo valor que en el servidor.

En el servidor, `ALLOWED_ORIGINS=https://studio-viral-ia.vercel.app`.
La app sube los clips directamente desde el navegador a este servidor (pestaña **Montaje** del resultado del episodio),
ajusta el `guion.json` al número de clips y añade `delogo` si los clips vienen de Dola.

## Probado
Con 3 clips de 15 s de Seedance 2.5 y su guion.json: HTTP 200, vídeo de 48 s con gancho, subtítulos sincronizados y cierre.
