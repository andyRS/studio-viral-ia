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


# Marcas de agua conocidas: resolución nativa de sus clips + zona a borrar
MARCAS = {
    "dola": {"res": "720:1280", "delogo": "x=603:y=1232:w=104:h=36"},
    "pavo": {"res": "704:1280", "delogo": "x=614:y=1220:w=66:h=38"},
}


# Texto en pantalla: se parte en líneas que quepan en 1080 px (Poppins Bold mide ~0,6 em por letra)
# y cada línea se centra por separado. Antes una frase larga se salía por los lados.
ANCHO_UTIL = 960


def lineas(texto, size, max_lineas=3):
    texto = "".join(c for c in str(texto) if ord(c) < 0x2190).strip()   # sin emojis: Poppins no los tiene
    cabe = max(8, int(ANCHO_UTIL / (size * 0.62)))
    out, cur = [], ""
    for w in texto.split():
        if cur and len(cur) + 1 + len(w) > cabe:
            out.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        out.append(cur)
    return out[:max_lineas]


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
except Exception as e:  # sin GPU utilizable: sigue en CPU en vez de fallar
    progreso(3, f"La GPU no está disponible ({str(e)[:80]}); Whisper sigue en el procesador")
    DEVICE = "cpu"
    model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), compute_type="int8")
progreso(4, "Whisper en la GPU (RTX)" if DEVICE == "cuda" else "Whisper en el procesador")
offsets, words_per_clip, t = [], [], 0.0
for ci, clip in enumerate(clips):
    progreso(5 + 55 * ci / len(clips), f"Escuchando el clip {ci + 1} de {len(clips)} con Whisper")
    offsets.append(t)
    wav = os.path.join(tmp, f"c{ci}.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", clip, "-ac", "1", "-ar", "16000", wav])
    w = wave.open(wav)
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    prompt = " ".join(txt for _, txt in G["clips"][ci])
    best = []
    for kw in ({}, {"initial_prompt": prompt}):          # sin guion (tiempos más precisos) y, si falla, con guion
        segs, _ = model.transcribe(x, language="es", word_timestamps=True, **kw)
        ws = [{"w": wd.word.strip(), "s": wd.start + t, "e": wd.end + t}
              for s in segs for wd in s.words if wd.start < dur(clip)]
        if len(ws) > len(best):
            best = ws
        if len(best) >= 0.6 * len(prompt.split()):
            break
    words_per_clip.append(best)
    if best:
        progreso(5 + 55 * (ci + 1) / len(clips), f"Clip {ci + 1}: oí «{' '.join(x['w'] for x in best)[:120]}»")
    elif G["clips"][ci]:
        progreso(5 + 55 * (ci + 1) / len(clips), f"Clip {ci + 1}: no se oyó voz; los subtítulos se reparten por tiempo")
    t += dur(clip)
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
    c1 = offsets[ci] + dur(clips[ci]) - 0.2
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

# 4) unir clips + cierre, gancho y subtítulos
inputs, fc, cat = [], "", ""
for ci, c in enumerate(clips):
    inputs += ["-i", c]
    dl = ""
    preset = MARCAS.get(str(G.get("marca", "")).lower())
    if preset:   # todos los clips se llevan primero a la resolución de esa herramienta y se borra su marca
        dl = f"scale={preset['res']},setsar=1,delogo={preset['delogo']},"
    elif G.get("delogo"):   # coordenadas propias, p.ej. "x=603:y=1232:w=104:h=36"
        if not re.fullmatch(r"x=\d{1,4}:y=\d{1,4}:w=\d{1,4}:h=\d{1,4}", str(G["delogo"])):
            raise ValueError("delogo debe indicar x, y, w y h en píxeles")
        dl = f"delogo={G['delogo']},"
    fc += (f"[{ci}:v]{dl}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24[v{ci}];"
           f"[{ci}:a]aresample=48000,aformat=channel_layouts=stereo[a{ci}];")
    cat += f"[v{ci}][a{ci}]"
n = len(clips)
if G.get("cierre"):
    progreso(68, f"Tarjeta final: «{G['cierre']}»" + (f" + «{G['cierre_cta']}»" if G.get("cierre_cta") else ""))
    # Tarjeta final de 3 s: el último cuadro del episodio difuminado y oscurecido, con
    # "Continuará..." (o "FIN") en grande y una línea de llamada a la acción opcional debajo.
    end = os.path.join(tmp, "end.mp4")
    last = os.path.join(tmp, "last.png")
    run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.3", "-i", clips[-1], "-frames:v", "1",
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
    inputs += ["-i", end]
    fc += f"[{n}:v]setsar=1,fps=24[v{n}];[{n}:a]aformat=channel_layouts=stereo[a{n}];"
    cat += f"[v{n}][a{n}]"
    n += 1
fc += f"{cat}concat=n={n}:v=1:a=1[vc][a];[vc]"
alpha = "alpha='if(lt(t,2.6),1,max(0,1-(t-2.6)/0.4))':enable='lt(t,3)'"
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
VCODEC = (["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0"]
          if os.environ.get("VIDEO_ENCODER") == "h264_nvenc"
          else ["-c:v", "libx264", "-crf", "17", "-preset", os.environ.get("X264_PRESET", "medium")])
mmss = lambda x: f"{int(x // 60)}:{int(x % 60):02d}"
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
progreso(100, "Vídeo listo")
print("OK", out_mp4, "bloques:", len(events))
