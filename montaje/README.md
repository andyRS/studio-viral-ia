# Montaje automático — Estudio Viral

Monta un episodio a partir de los clips generados (Dola, Higgsfield…) y su `guion.json`:
une los clips en 1080x1920, quema subtítulos karaoke con el color de cada personaje,
pone el gancho los primeros 3 s, las tarjetas y la tarjeta final, y quita la marca de agua de Dola o Pavo.

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
  "cierre_cta": "Comenta PARTE 2",
  "marca": "pavo",
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
- `marca` (opcional): `"dola"` o `"pavo"`. Reescala cada clip a la resolución de esa herramienta (Dola 720x1280, Pavo 704x1280) y borra su marca de agua, aunque algún clip venga en otra resolución. Para otra marca, `delogo` con coordenadas propias (`x=..:y=..:w=..:h=..`, se valida).
- `cierre` + `cierre_cta` (opcionales): tarjeta final de 3 s sobre el último cuadro difuminado y oscurecido; `cierre` en blanco grande ("Continuará..." o "FIN" en el último episodio) y `cierre_cta` en amarillo debajo ("Comenta PARTE 2", "Escribe AMÉN"). Los emojis se quitan porque la fuente no los dibuja.
- v2: los bloques de subtítulos ya nunca se enciman.
- `formato: "16:9"` (proyecto largo para Facebook y YouTube): vídeo 1920x1080, subtítulos abajo, gancho arriba, sin chats de WhatsApp y miniatura 1280x720 (`<salida>_portada.jpg`). Se monta un acto por trabajo (hasta 80 clips).
- `recortes: [{"desde": 3, "hasta": 6, "titulo": "..."}]`: clips verticales 1080x1920 (`<salida>_clip_N.mp4`) para TikTok y Reels, con la imagen al centro, fondo difuminado, título arriba y «Película completa en el perfil» abajo.

## Uso por línea de comandos
```
python3 -I subtitular.py guion.json salida.mp4 clip1.mp4 clip2.mp4 ...
```

## Montar en tu PC (Windows + NVIDIA)
Doble clic en `local/Montar en mi PC.bat` y deja la ventana abierta. La primera vez crea
`%USERPROFILE%\Developer\montaje-env` (reutiliza faster-whisper y torch con CUDA de `whisperx-env` si existe).
Escucha solo en `127.0.0.1:8765`, usa Whisper en la GPU y codifica con NVENC: un episodio de 11 clips
en ~20 s (RTX 4060). La app lo detecta sola y lo ofrece como «Este PC»; Fly queda de respaldo.
Chrome pide una vez permiso para que la página acceda a la red local: hay que pulsar «Permitir».

## API
- `GET /salud` → `{"ok": true}`
- `POST /trabajos` (multipart, mismos campos y autorización que `/montar`) → `{"id": "..."}` al instante. Es lo que usa la app.
- `GET /trabajos/{id}?desde=N` → estado en vivo `{"estado","pct","paso","log","seq","error"}`. Espera hasta 20 s a que haya un paso nuevo (la página ve el montaje en vivo y la conexión abierta evita que Fly apague la máquina a mitad).
- `POST /unir` (solo en el PC, cabecera `X-Montaje-Local: 1`): campos `partes` (2-12 actos montados, en orden) → la película completa en un MP4, sin recodificar.
- `GET /trabajos/{id}/video` → el vídeo terminado; se guarda 30 min. El id (aleatorio, 128 bits) hace de llave, así un montaje largo no depende del pase de 15 min.
- Un montaje a la vez; los demás quedan «en cola». `subtitular.py` informa su avance con líneas `PROGRESO <pct> <mensaje>`.
- Velocidad: `WHISPER_MODEL=base` y `X264_PRESET=veryfast` (en el Dockerfile). Para ir aún más rápido, una máquina con más CPU: en `fly.toml`, `cpu_kind = "performance"`.
- `POST /montar` (multipart): campo `guion` (archivo) y uno o varios campos `clips` (en orden). Opcional: `musica` (MP3/WAV/M4A, p. ej. de Muse), que va en bucle bajo las voces y baja sola cuando hablan. Opcional: `anterior` (vídeo final o último clip de la parte anterior) abre el episodio con 7 s en blanco y negro y «Anteriormente...». Por defecto se quitan los silencios del inicio y el final de cada clip con diálogo (`"recortar": false` en el guion lo desactiva) y `"tarjetas"` añade saltos de tiempo («Horas después...»).
  Autorización obligatoria con `MONTAJE_TOKEN`, de una de estas dos formas:
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
La app asigna clips `s01`, `s02`… en la mesa de escenas y los sube directamente a este servidor cuando todos están aprobados. Los archivos viven en la sesión del navegador: si se cierra la página, se deben seleccionar de nuevo.

## Probado
Con 3 clips de 15 s de Seedance 2.5 y su guion.json: HTTP 200, vídeo de 48 s con gancho, subtítulos sincronizados y cierre.
