"""Subtítulos karaoke por personaje para microdramas IA.

Uso:
  python3 -I subtitular.py guion.json salida.mp4 clip1.mp4 [clip2.mp4 ...]

- Une los clips (1080x1920), añade gancho opcional (primeros 3 s) y cierre "Continuará..." opcional.
- Transcribe cada clip con faster-whisper (palabras con tiempo), alinea con el texto
  correcto del guion y quema subtítulos ASS: cada palabra pasa de blanco al color de quien habla.

guion.json:
{
  "colores": {"FRESA": "FF4D6D", "MANGO": "FF9A1F"},
  "gancho": ["Le dijo que estaba en su asiento...", "sin saber quién era él"],   (opcional)
  "cierre": "Continuará...",          (opcional; "FIN" en el último episodio)
  "cierre_cta": "Comenta PARTE 2",     (opcional; línea amarilla debajo, p.ej. "Escribe AMÉN")
  "clips": [
    [["FRESA", "Disculpe... usted está en mi asiento."], ["MANGO", "¿Ah, sí?"]],
    [["MANGO", "Esta canción es para la fresa de la fila tres."]]
  ]
}
Opcionales:
  "marca": "dola" | "pavo"   quita la marca de agua de esa herramienta (reescala antes los clips con otra resolución)
  "delogo": "x=..:y=..:w=..:h=.."   coordenadas propias si la marca es otra
  "logo": true (por defecto)   encima de la zona borrada va la marca FrutiEnganchados (marca/frutienganchados.png),
                               del tamaño justo para taparla: no se nota el difuminado
  "recortar": true (por defecto)   quita el silencio muerto al inicio y al final de cada clip con diálogo
                                   (los clips de IA traen medio segundo o más): el vídeo fluye sin pausas.
  "tarjetas": [{"antes": 3, "texto": "Horas después..."}]   tarjeta negra de 1,6 s antes del clip 3 (índice desde 0)
  "anterior_archivo": lo pone server.py: vídeo o clip de la parte anterior; abre el episodio con 7 s en
                      blanco y negro y «Anteriormente...».
  "musica_modo": "extremos" | "todo"   «extremos»: la música (firma de la serie) suena solo en los primeros 4 s
                                     y en los últimos 8 s con el «Continuará…»; «todo» (por defecto): todo el vídeo.
  "portada": {"serie": "...", "frase": ["línea 1", "línea 2"], "parte": 6, "clip": 3}   portada 1080x1920 junto al
                               vídeo (<salida>_portada.jpg): franja oscura arriba con la serie y la frase, «PARTE» y el
                               número enorme en dorado abajo (Poppins + Lora, sin contorno, sombra suave)
  "musica_volumen": 0.05-0.4   volumen de la música de fondo (0.18 por defecto). El archivo lo pone
                               server.py en "musica_archivo"; se repite si es corto y baja sola cuando hablan.
  Un bloque vacío [] sirve para clips sin diálogo (tarjetas "Un año después...").
Variables de entorno: FONT_DIR (carpeta con Poppins-Bold.ttf), WHISPER_MODEL (small por defecto).
"""
import sys, os, json, re, shutil, subprocess, tempfile, unicodedata, difflib, wave
import numpy as np

FONTDIR = os.environ.get("FONT_DIR") or (os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts") if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "Poppins-Bold.ttf")) else "/usr/share/fonts/truetype/google-fonts")
FONT = os.path.join(FONTDIR, "Poppins-Bold.ttf")

guion_path, out_mp4 = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
clips = [os.path.abspath(c) for c in sys.argv[3:]]
G = json.load(open(guion_path, encoding="utf-8"))
assert len(G["clips"]) == len(clips), "un bloque de diálogo por clip"
tmp = tempfile.mkdtemp()
# Los filtros de ffmpeg no aceptan rutas tipo "C:\..." (Windows): se trabaja dentro de tmp con
# rutas relativas (fuente, textos y subtítulos copiados ahí). En Linux funciona igual.
shutil.copy(FONT, os.path.join(tmp, "Poppins-Bold.ttf"))
os.chdir(tmp)
FONT_F = "Poppins-Bold.ttf"
# Lora (títulos de portada); si no está, se usa Poppins.
LORA = os.path.join(os.path.dirname(FONT), "Lora-Bold.ttf")
LORA_F = FONT_F
if os.path.exists(LORA):
    shutil.copy(LORA, os.path.join(tmp, "Lora-Bold.ttf"))
    LORA_F = "Lora-Bold.ttf"


# Marcas de agua conocidas: cada resolución en la que exporta esa herramienta + zona a borrar.
# Solo se borra en los clips de ESA herramienta (se reconocen por su resolución): los de Melius,
# Higgsfield u otra no se tocan aunque vayan en el mismo episodio.
MARCAS = {
    "dola": [{"res": (720, 1280), "box": (603, 1232, 104, 36)}],
    "pavo": [{"res": (704, 1280), "box": (614, 1220, 66, 38)},
             {"res": (720, 1260), "box": (630, 1200, 66, 38)}],   # misma marca, mismos márgenes (24 px dcha., 22 px abajo)
}


def tam(f):
    w, h = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                           "-of", "csv=p=0", f], capture_output=True, text=True).stdout.strip().split(",")[:2]
    return int(w), int(h)


def marca_de(clip, variantes):
    """Zona de la marca en ESTE clip (x, y, w, h en sus píxeles) o None si el clip no es de esa herramienta.
    Acepta también el mismo formato reescalado (misma proporción): la zona se escala igual."""
    w, h = tam(clip)
    for v in variantes:
        vw, vh = v["res"]
        if abs(w / h - vw / vh) < 0.004:
            k = w / vw
            x, y, bw, bh = v["box"]
            return (round(x * k), round(y * k), max(2, round(bw * k)), max(2, round(bh * k))), (w, h)
    return None, (w, h)


# Texto en pantalla: se parte en líneas que quepan en 1080 px (Poppins Bold mide ~0,6 em por letra)
# y cada línea se centra por separado. Antes una frase larga se salía por los lados.
ANCHO_UTIL = 960


def lineas(texto, size, max_lineas=3):
    texto = "".join(c for c in str(texto) if ord(c) < 0x2190).strip()   # sin emojis: Poppins no los tiene
    cabe = max(8, int(ANCHO_UTIL / (size * 0.62)))

    def partir(ancho):
        out, cur = [], ""
        for w in texto.split():
            if cur and len(cur) + 1 + len(w) > ancho:
                out.append(cur); cur = w
            else:
                cur = f"{cur} {w}".strip()
        return out + [cur] if cur else out

    out = partir(cabe)
    # Líneas parejas: con el mismo número de líneas, el ancho más estrecho posible
    # (evita una palabra suelta abajo, tipo «plaza...»).
    ancho = cabe
    while ancho > 8 and len(partir(ancho - 1)) == len(out):
        ancho -= 1
    return partir(ancho)[:max_lineas]


def ajustar(texto, size, minimo):
    """Baja el tamaño hasta que el texto quepa en 2 líneas (o llega al mínimo)."""
    while size > minimo and len(lineas(texto, size, 99)) > 2:
        size -= 4
    return size, lineas(texto, size)


TXT_N = [0]


def texto_dt(texto, size, color, y, borde, extra=""):
    """drawtext de una línea centrada; el texto va en archivo (apóstrofos y dos puntos no rompen el filtro)."""
    TXT_N[0] += 1
    f = f"txt{TXT_N[0]}.txt"
    open(f, "w", encoding="utf-8").write(texto)
    return (f"drawtext=fontfile={FONT_F}:textfile={f}:fontsize={size}:fontcolor={color}:borderw={borde}:"
            f"bordercolor=black@0.85:shadowcolor=black@0.6:shadowx=0:shadowy=4:x=(w-text_w)/2:y={y}{extra}")


def run(cmd):
    subprocess.run(cmd, check=True)


def progreso(pct, msg):
    """Línea que lee server.py para mostrar el montaje en vivo: PROGRESO <0-100> <mensaje>."""
    print(f"PROGRESO {int(pct)} {msg}", flush=True)


def dur(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", f], capture_output=True, text=True).stdout)


def norm(w):
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", w)


# 1) palabras con tiempo por clip
progreso(2, f"Preparando {len(clips)} clips y cargando Whisper")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
if DEVICE == "cuda":
    try:
        import torch  # noqa: F401  en Windows carga las DLL de CUDA (cuBLAS/cuDNN) que usa faster-whisper
    except Exception:
        pass
from faster_whisper import WhisperModel
try:
    model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device=DEVICE, compute_type="float16" if DEVICE == "cuda" else "int8")
    if DEVICE == "cuda":  # sin cuBLAS/cuDNN el fallo llega al transcribir: se prueba con 1 s de silencio
        list(model.transcribe(np.zeros(16000, np.float32), language="es")[0])
except Exception as e:  # sin GPU utilizable: sigue en CPU en vez de fallar
    progreso(3, f"La GPU no está disponible ({str(e)[:80]}); Whisper sigue en el procesador")
    DEVICE = "cpu"
    model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), compute_type="int8")
progreso(4, "Whisper en la GPU (RTX)" if DEVICE == "cuda" else "Whisper en el procesador")
RECORTAR = G.get("recortar", True) is not False
CARD_S = 1.6
TARJETAS = {}
for tj in G.get("tarjetas") or []:
    try:
        k, txt = int(tj.get("antes")), str(tj.get("texto") or "").strip()
    except (TypeError, ValueError, AttributeError):
        continue
    if 0 < k < len(clips) and txt:
        TARJETAS[k] = txt[:60]
ANTERIOR = G.get("anterior_archivo") if G.get("anterior_archivo") and os.path.exists(G["anterior_archivo"]) else ""
RECAP_S = 0.0
if ANTERIOR:
    da = dur(ANTERIOR)
    # Vídeo final de la parte anterior (>20 s): se salta su tarjeta final de 3 s. Clip suelto: su final.
    fin = da - 3.2 if da > 20 else da
    RECAP_S = round(min(7.0, fin), 2)
    RECAP_INI = max(0.0, fin - RECAP_S)
offsets, words_per_clip, recortes, t = [], [], [], RECAP_S
for ci, clip in enumerate(clips):
    progreso(5 + 55 * ci / len(clips), f"Escuchando el clip {ci + 1} de {len(clips)} con Whisper")
    if ci in TARJETAS:
        t += CARD_S
    offsets.append(t)
    wav = os.path.join(tmp, f"c{ci}.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", clip, "-ac", "1", "-ar", "16000", wav])
    w = wave.open(wav)
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    prompt = " ".join(txt for _, txt in G["clips"][ci])
    D = dur(clip)
    best = []
    for kw in ({}, {"initial_prompt": prompt}):          # sin guion (tiempos más precisos) y, si falla, con guion
        segs, _ = model.transcribe(x, language="es", word_timestamps=True, **kw)
        ws = [{"w": wd.word.strip(), "s": wd.start, "e": wd.end}
              for s in segs for wd in s.words if wd.start < D]
        if len(ws) > len(best):
            best = ws
        if len(best) >= 0.6 * len(prompt.split()):
            break
    # Recorte de silencios muertos: se empieza justo antes de la primera palabra y se corta medio
    # segundo largo después de la última (deja ver la reacción). Sin voz detectada, el clip va entero.
    a, b = 0.0, D
    if RECORTAR and best and G["clips"][ci]:
        primera, ultima = best[0]["s"], max(x["e"] for x in best)
        if primera > 0.35:
            a = max(0.0, primera - 0.18)
        if D - ultima > 0.95:
            b = min(D, ultima + 0.7)   # 0,7 s de reacción tras la frase
        if b - a < 1.2:
            a, b = 0.0, D
    for x in best:
        x["s"] += t - a; x["e"] += t - a
    recortes.append((a, b))
    words_per_clip.append(best)
    if a > 0.05 or D - b > 0.05:
        progreso(5 + 55 * (ci + 1) / len(clips), f"Clip {ci + 1}: quito {a + D - b:.1f} s de silencio")
    if best:
        progreso(5 + 55 * (ci + 1) / len(clips), f"Clip {ci + 1}: oí «{' '.join(x['w'] for x in best)[:120]}»")
    elif G["clips"][ci]:
        progreso(5 + 55 * (ci + 1) / len(clips), f"Clip {ci + 1}: no se oyó voz; los subtítulos se reparten por tiempo")
    t += b - a
progreso(61, "Alineando el texto del guion con las voces")

# 2) alinear texto del guion con las palabras oídas
sw, times = [], []   # sw: (hablante, palabra)
for ci, lines in enumerate(G["clips"]):
    toks = [(spk, tok) for spk, txt in lines for tok in txt.split()]
    cw = words_per_clip[ci]
    sm = difflib.SequenceMatcher(a=[norm(x) for _, x in toks], b=[norm(x["w"]) for x in cw], autojunk=False)
    loc = [None] * len(toks)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            loc[blk.a + k] = (cw[blk.b + k]["s"], cw[blk.b + k]["e"])
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "replace":
            for k in range(i2 - i1):
                j = j1 + int(k * (j2 - j1) / (i2 - i1))
                if j < j2:
                    loc[i1 + k] = (cw[j]["s"], cw[j]["e"])
    c0 = offsets[ci]
    c1 = offsets[ci] + (recortes[ci][1] - recortes[ci][0]) - 0.2
    known = [k for k, v in enumerate(loc) if v]
    for k in range(len(loc)):
        if loc[k]:
            continue
        p = max([q for q in known if q < k], default=None)
        n = min([q for q in known if q > k], default=None)
        if p is not None and n is not None:
            span = (loc[n][0] - loc[p][1]) / (n - p)
            st = loc[p][1] + span * (k - p - 1)
            loc[k] = (st, st + max(span, 0.15))
        elif p is not None:
            st = min(loc[p][1] + 0.05, c1 - 0.3); loc[k] = (st, st + 0.3)
        elif n is not None:
            loc[k] = (max(c0, loc[n][0] - 0.3), loc[n][0])
        else:
            st = c0 + 0.3 + k * 0.35; loc[k] = (st, st + 0.3)
    # índice de línea global para cortar bloques por frase
    li = 0
    for (spk, txt) in lines:
        for tok in txt.split():
            sw.append((spk, tok, f"{ci}-{li}"))
        li += 1
    times += loc
for i in range(1, len(times)):
    s, e = times[i]
    if s < times[i - 1][0]:
        s = times[i - 1][0] + 0.05
    times[i] = (s, max(e, s + 0.15))

# 3) bloques de máximo 3 palabras (con la letra grande, 4 no caben en una línea en el móvil)
events, i = [], 0
while i < len(sw):
    ch = [i]
    while True:
        j = ch[-1] + 1
        if j >= len(sw) or sw[j][2] != sw[i][2] or len(ch) >= 3:
            break
        if re.search(r"[.!?…]$", sw[ch[-1]][1]) and len(ch) >= 2:
            break
        ch.append(j)
    events.append(ch)
    i = ch[-1] + 1


def ts(t):
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def bgr(h):
    return "&H00" + h[4:6] + h[2:4] + h[0:2] + "&"


ass = ["""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Poppins,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,1,0,0,0,100,100,1,0,1,7,3,2,70,70,470,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""]
for n, ch in enumerate(events):
    spk = sw[ch[0]][0]
    st, en = times[ch[0]][0], times[ch[-1]][1] + 0.35
    en = max(en, times[ch[-1]][1])
    if n + 1 < len(events):
        en = min(en, times[events[n + 1][0]][0] - 0.02)   # nunca se encima con el siguiente bloque
    en = max(en, st + 0.2)
    parts, cur = [], st
    for k in ch:
        ws, we = times[k]
        parts.append(f"{{\\k{max(0, round((ws - cur) * 100))}}}{{\\kf{max(1, round((we - ws) * 100))}}}{sw[k][1]}")
        cur = we
    ass.append(f"Dialogue: 0,{ts(st)},{ts(en)},Sub,{spk},0,0,0,,{{\\fscx88\\fscy88\\t(0,90,\\fscx100\\fscy100)\\1c{bgr(G['colores'][spk])}\\2c&H00FFFFFF&}}{' '.join(parts)}\n")
ass_path = os.path.join(tmp, "subs.ass")
open(ass_path, "w", encoding="utf-8").writelines(ass)
progreso(65, f"Subtítulos de colores listos: {len(events)} bloques sin encimarse")

# 4) unir: «Anteriormente», clips (recortados) con sus tarjetas de tiempo, cierre, gancho y subtítulos
inputs, fc, cat, n = [], "", "", 0
ZONAS = []   # marcas borradas: (zona, resolución del clip), para poner el emblema encima


def segmento(path, vf_extra=""):
    """Añade un vídeo ya normalizado (1080x1920, 24 fps, estéreo) a la secuencia."""
    global fc, cat, n
    inputs.extend(["-i", path])
    fc += f"[{n}:v]setsar=1,fps=24{vf_extra}[v{n}];[{n}:a]aresample=48000,aformat=channel_layouts=stereo[a{n}];"
    cat += f"[v{n}][a{n}]"
    n += 1


if ANTERIOR:
    progreso(66, f"«Anteriormente...»: {RECAP_S:.0f} s de la parte anterior en blanco y negro")
    rec = os.path.join(tmp, "anterior.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{RECAP_INI:.2f}", "-t", f"{RECAP_S:.2f}", "-i", ANTERIOR,
         "-filter_complex", "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24,hue=s=0,eq=contrast=1.08,"
         + texto_dt("Anteriormente...", 76, "white", "(h-text_h)/2", 5)
         + f",fade=t=out:st={max(0, RECAP_S - 0.25):.2f}:d=0.25[v];[0:a]aresample=48000,aformat=channel_layouts=stereo[a]",
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", rec])
    segmento(rec)
for ci, c in enumerate(clips):
    if ci in TARJETAS:   # salto de tiempo: negro con el texto, como «Horas después...»
        card = os.path.join(tmp, f"tarjeta{ci}.mp4")
        run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=black:s=1080x1920:r=24:d={CARD_S}",
             "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", str(CARD_S),
             "-vf", texto_dt(TARJETAS[ci], 70, "white", "(h-text_h)/2", 0, ":alpha='min(1,t/0.35)'") + ",format=yuv420p",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", card])
        segmento(card)
    inputs += ["-i", c]
    dl = ""
    variantes = MARCAS.get(str(G.get("marca", "")).lower())
    if variantes:   # se borra solo si el clip es de esa herramienta (por su resolución)
        caja, wh = marca_de(c, variantes)
        if caja:
            x, y, bw, bh = caja
            dl = f"delogo=x={min(x, wh[0] - bw - 1)}:y={min(y, wh[1] - bh - 1)}:w={bw}:h={bh},"
            ZONAS.append((caja, wh))
    elif G.get("delogo"):   # coordenadas propias, p.ej. "x=603:y=1232:w=104:h=36"
        if not re.fullmatch(r"x=\d{1,4}:y=\d{1,4}:w=\d{1,4}:h=\d{1,4}", str(G["delogo"])):
            raise ValueError("delogo debe indicar x, y, w y h en píxeles")
        dl = f"delogo={G['delogo']},"
    a, b = recortes[ci]
    # Corte seco y limpio: trim al tramo con voz y micro-fundido de audio (sin «clic» entre clips).
    fc += (f"[{n}:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS,{dl}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24[v{n}];"
           f"[{n}:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,"
           f"afade=t=in:d=0.03,afade=t=out:st={max(0, b - a - 0.04):.3f}:d=0.04[a{n}];")
    cat += f"[v{n}][a{n}]"
    n += 1
if G.get("cierre"):
    progreso(68, f"Tarjeta final: «{G['cierre']}»" + (f" + «{G['cierre_cta']}»" if G.get("cierre_cta") else ""))
    # Tarjeta final de 3 s: el último cuadro del episodio difuminado y oscurecido, con
    # "Continuará..." (o "FIN") en grande y una línea de llamada a la acción opcional debajo.
    end = os.path.join(tmp, "end.mp4")
    last = os.path.join(tmp, "last.png")
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, recortes[-1][1] - 0.3):.2f}", "-i", clips[-1], "-frames:v", "1",
         "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", last])
    cta = str(G.get("cierre_cta") or "").strip()
    if re.match(r"(?i)llamada final", cta):   # se coló el rótulo del campo en vez de la frase
        cta = ""
    s1, l1 = ajustar(G["cierre"], 110, 72)
    s2, l2 = ajustar(cta, 64, 44) if cta else (0, [])
    alto = len(l1) * int(s1 * 1.2) + (40 + len(l2) * int(s2 * 1.25) if l2 else 0)
    y = 960 - alto // 2
    capas = ["boxblur=20:2", "eq=brightness=-0.35"]
    for ln in l1:
        capas.append(texto_dt(ln, s1, "white", y, 6)); y += int(s1 * 1.2)
    y += 40
    for ln in l2:   # p.ej. "Comenta PARTE 2" o "Escribe AMÉN", en amarillo
        capas.append(texto_dt(ln, s2, "0xFFD23F", y, 5)); y += int(s2 * 1.25)
    vf = ",".join(capas)
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "24", "-i", last,
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "3", "-vf", vf + ",format=yuv420p",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", end])
    segmento(end)
# Marca FrutiEnganchados sobre la zona borrada (la cubre entera con unos píxeles de margen).
LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "marca", "frutienganchados.png")
zona = None
def a_salida(caja, W0, H0):
    """Zona de un clip (en sus píxeles) en el vídeo final 1080x1920 (mismo escalado y recorte centrado)."""
    x, y, w, h = caja
    f = max(1080 / W0, 1920 / H0)
    ox, oy = (W0 * f - 1080) / 2, (H0 * f - 1920) / 2
    return (x * f - ox, y * f - oy, w * f, h * f)


if G.get("logo", True) is not False and os.path.exists(LOGO) and (ZONAS or G.get("delogo")):
    if ZONAS:   # clips de distintas resoluciones (704x1280, 720x1260…): el emblema cubre la zona de todos
        cajas = [a_salida(c, *wh) for c, wh in ZONAS]
        x0, y0 = min(c[0] for c in cajas), min(c[1] for c in cajas)
        x1, y1 = max(c[0] + c[2] for c in cajas), max(c[1] + c[3] for c in cajas)
        zona = (x0, y0, x1 - x0, y1 - y0)
    else:
        W0, H0 = tam(clips[0])
        zona = a_salida(tuple(int(kv.split("=")[1]) for kv in str(G["delogo"]).split(":")), W0, H0)
MUSICA = G.get("musica_archivo") if G.get("musica_archivo") and os.path.exists(G["musica_archivo"]) else ""
fc += f"{cat}concat=n={n}:v=1:a=1[vc][{'voz' if MUSICA else 'a'}];"
if zona:
    zx, zy, zw, zh = zona
    lw, lh = (int(v) for v in subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", LOGO],
                                             capture_output=True, text=True).stdout.strip().split(","))
    # Núcleo totalmente opaco del emblema (marca/frutienganchados.json): se escala lo justo para que ese
    # núcleo cubra la marca con 4 px de margen por lado y se centra encima. Así es pequeño y siempre la tapa.
    try:
        n0x, n0y, n1x, n1y = json.load(open(os.path.splitext(LOGO)[0] + ".json", encoding="utf-8"))["nucleo"]
    except Exception:
        n0x, n0y, n1x, n1y = 0.0, 0.0, 1.0, 1.0
    esc = max((zw + 8) / ((n1x - n0x) * lw), (zh + 8) / ((n1y - n0y) * lh))
    ancho, alto = lw * esc, lh * esc
    x = zx + zw / 2 - ((n0x + n1x) / 2) * ancho
    y = zy + zh / 2 - ((n0y + n1y) / 2) * alto
    x = max(0, min(1080 - ancho, x))
    shutil.copy(LOGO, "marca.png")
    li = n + (1 if MUSICA else 0)                   # entrada del logo (después de la música si la hay)
    fc += f"[{li}:v]scale={int(ancho)}:{int(alto)}[logo];[vc][logo]overlay={int(x)}:{int(y)}[vm];[vm]"
    progreso(69, f"Marca FrutiEnganchados sobre la marca de {G.get('marca') or 'agua'} ({int(ancho)}×{int(alto)} px)")
else:
    fc += "[vc]"
# El gancho sale en los 3 primeros segundos del episodio nuevo (después de «Anteriormente...» si lo hay).
H0 = RECAP_S
alpha = f"alpha='if(lt(t,{H0 + 2.6:.2f}),1,max(0,1-(t-{H0 + 2.6:.2f})/0.4))':enable='between(t,{H0:.2f},{H0 + 3:.2f})'"
y = 205
gancho = G.get("gancho", [])
size = min([ajustar(line, 66, 46)[0] for line in gancho] or [66])   # las dos líneas, del mismo tamaño
for k, line in enumerate(gancho):
    col = "white" if k == 0 else "0xFFD23F"
    ls = lineas(line, size)
    for ln in ls:
        fc += texto_dt(ln, size, col, y, 5, ":" + alpha) + ","
        y += int(size * 1.2)
    y += 10
fc += "ass=subs.ass:fontsdir=.[v]"
total = t + (3 if G.get("cierre") else 0)
if MUSICA:
    # Música de fondo (p. ej. de Muse): en bucle hasta el final, entra y sale con fundido y baja
    # sola cuando alguien habla (sidechain con las voces), para que el diálogo se entienda siempre.
    # La pista se iguala primero a un volumen fijo (-24 LUFS: cualquier pista de Muse suena igual) y queda unos
    # 6 dB bajo las voces; cuando hablan baja solo ~4 dB más. Antes iba al 18 % y con la voz casi continua
    # (sin pausas) se hundía 12-15 dB y no se oía.
    vol = min(0.4, max(0.05, float(G.get("musica_volumen") or 0.18)))
    EXTREMOS = str(G.get("musica_modo") or "") == "extremos"
    gan = vol / 0.18                                   # 0.18 = «Suave (recomendado)» = nivel de referencia
    inputs += ["-stream_loop", "-1", "-i", MUSICA]   # entrada n (el logo, si lo hay, va después)
    fc += (f";[{n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total:.2f},"
           f"loudnorm=I=-24:TP=-3:LRA=11,aresample=48000,volume={gan:.2f},"
           # «extremos»: la música sube en los primeros 4 s y en los últimos 8 s; en medio queda en silencio.
           + (f"volume='max(clip(4.5-t,0,1),clip(t-{max(5.0, total - 8.5):.2f},0,1))':eval=frame," if EXTREMOS else "")
           + f"afade=t=in:d=0.6,afade=t=out:st={max(0, total - 2.5):.2f}:d=2.5[mus];"
           f"[voz]asplit[voz1][voz2];[mus][voz1]sidechaincompress=threshold=0.08:ratio=2.5:attack=30:release=400[musb];"
           f"[voz2][musb]amix=inputs=2:duration=first:normalize=0[a]")
    if EXTREMOS:
        progreso(69, "Música solo al inicio (4 s) y al final con el «Continuará…»; en medio, voces y ambiente")
    else:
        progreso(69, f"Música de fondo a volumen fijo ({'muy suave' if gan < 0.8 else 'media' if gan > 1.2 else 'suave'}), baja un poco cuando hablan")
VCODEC = (["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0"]
          if os.environ.get("VIDEO_ENCODER") == "h264_nvenc"
          else ["-c:v", "libx264", "-crf", "17", "-preset", os.environ.get("X264_PRESET", "medium")])
mmss = lambda x: f"{int(x // 60)}:{int(x % 60):02d}"
if zona:
    inputs += ["-i", "marca.png"]   # imagen fija: overlay la repite hasta el final
progreso(70, f"Codificando el vídeo final 1080x1920 ({mmss(total)}) con {'la GPU (NVENC)' if VCODEC[1] == 'h264_nvenc' else 'x264'}")
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-nostats", "-progress", "pipe:1", *inputs, "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
     *VCODEC, "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out_mp4], stdout=subprocess.PIPE, text=True)
last_pct = -1
for row in enc.stdout:
    if row.startswith("out_time_us=") and row[12:].strip().isdigit():
        done = int(row[12:]) / 1e6
        pct = 70 + 29 * min(1, done / max(total, 1))
        if int(pct) != last_pct:
            last_pct = int(pct); progreso(pct, f"Codificando el vídeo final: {mmss(done)} de {mmss(total)}")
if enc.wait() != 0:
    raise SystemExit("ffmpeg falló al codificar el vídeo final")
# Portada fija (mismo diseño en todas las partes): fotograma limpio de una escena (sin subtítulos ni
# gancho), franja casi negra arriba que se funde con la imagen y zona oscura abajo detrás de «PARTE N».
P = G.get("portada") if isinstance(G.get("portada"), dict) else None
if P:
    try:
        k = int(P.get("clip", round(len(clips) * 0.35)))
        k = min(max(k, 0), len(clips) - 1)
        a, b = recortes[k]
        foto = os.path.join(tmp, "portada_base.png")
        variantes = MARCAS.get(str(G.get("marca", "")).lower())
        caja = marca_de(clips[k], variantes)[0] if variantes else None
        dl = f"delogo=x={caja[0]}:y={caja[1]}:w={caja[2]}:h={caja[3]}," if caja else ""
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a + (b - a) * 0.45:.2f}", "-i", clips[k], "-frames:v", "1",
             # La toma se baja (260 px por defecto) para que las caras queden en la zona clara, bajo la franja oscura.
             "-vf", f"{dl}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
                    f"crop=1080:{1920 - int(P.get('bajar', 260))}:0:0,pad=1080:1920:0:{int(P.get('bajar', 260))}:black", foto])
        sombra = ":shadowcolor=black@0.55:shadowx=0:shadowy=6"
        def texto(t, fuente, size, color, y):
            TXT_N[0] += 1
            f = f"txt{TXT_N[0]}.txt"
            open(f, "w", encoding="utf-8").write(t)
            return f"drawtext=fontfile={fuente}:textfile={f}:fontsize={size}:fontcolor={color}:x=(w-text_w)/2:y={y}{sombra}"
        capas = []
        y = 300
        for ln in lineas(str(P.get("serie") or ""), 66, 2):
            capas.append(texto(ln, LORA_F, 66, "white", y)); y += 80
        y += 14
        frase = [str(x) for x in (P.get("frase") or []) if str(x).strip()][:2]
        for ln in [l for f_ in frase for l in lineas(f_, 50, 2)][:3]:
            capas.append(texto(ln, FONT_F, 50, "white", y)); y += 62
        capas.append(texto("PARTE", FONT_F, 92, "white", 1295))
        capas.append(texto(str(P.get("parte") or ""), LORA_F, 340, "0xF2C14E", 1370))
        B = int(P.get("bajar", 260))   # la franja es opaca hasta donde empieza la toma y luego se funde
        degradado = ("color=c=black:s=1080x1920,format=rgba,"
                     f"geq=r=0:g=0:b=0:a='255*max(if(lt(Y,{B + 30}),0.97,0.97*pow(max(0,1-(Y-{B + 30})/560),1.1)),0.9*min(1,max(0,(Y-1120)/520)))'")
        portada = os.path.splitext(out_mp4)[0] + "_portada.jpg"
        run(["ffmpeg", "-v", "error", "-y", "-i", foto, "-f", "lavfi", "-i", degradado, "-filter_complex",
             "[0:v][1:v]overlay=0:0," + ",".join(capas) + "[v]", "-map", "[v]", "-frames:v", "1", "-q:v", "2", portada])
        progreso(99, f"Portada lista: PARTE {P.get('parte')}")
    except Exception as e:   # la portada nunca impide entregar el vídeo
        progreso(99, f"No se pudo crear la portada ({str(e)[:80]})")
progreso(100, "Vídeo listo")
print("OK", out_mp4, "bloques:", len(events))
