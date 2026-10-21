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
  "cierre": "Continuará...",                                                     (opcional)
  "clips": [
    [["FRESA", "Disculpe... usted está en mi asiento."], ["MANGO", "¿Ah, sí?"]],
    [["MANGO", "Esta canción es para la fresa de la fila tres."]]
  ]
}
Opcionales:
  "delogo": "x=603:y=1232:w=104:h=36"   quita la marca de agua de Dola (clips 720x1280)
  Un bloque vacío [] sirve para clips sin diálogo (tarjetas "Un año después...").
Variables de entorno: FONT_DIR (carpeta con Poppins-Bold.ttf), WHISPER_MODEL (small por defecto).
"""
import sys, os, json, re, subprocess, tempfile, unicodedata, difflib, wave
import numpy as np

FONTDIR = os.environ.get("FONT_DIR") or (os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts") if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "Poppins-Bold.ttf")) else "/usr/share/fonts/truetype/google-fonts")
FONT = os.path.join(FONTDIR, "Poppins-Bold.ttf")

guion_path, out_mp4, clips = sys.argv[1], sys.argv[2], sys.argv[3:]
G = json.load(open(guion_path, encoding="utf-8"))
assert len(G["clips"]) == len(clips), "un bloque de diálogo por clip"
tmp = tempfile.mkdtemp()


def run(cmd):
    subprocess.run(cmd, check=True)


def dur(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", f], capture_output=True, text=True).stdout)


def norm(w):
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", w)


# 1) palabras con tiempo por clip
from faster_whisper import WhisperModel
model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), compute_type="int8")
offsets, words_per_clip, t = [], [], 0.0
for ci, clip in enumerate(clips):
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
    t += dur(clip)

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

# 3) bloques de máximo 4 palabras
events, i = [], 0
while i < len(sw):
    ch = [i]
    while True:
        j = ch[-1] + 1
        if j >= len(sw) or sw[j][2] != sw[i][2] or len(ch) >= 4:
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
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Poppins,54,&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,1,0,0,0,100,100,0,0,1,4,1,2,80,80,430,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""]
for n, ch in enumerate(events):
    spk = sw[ch[0]][0]
    st, en = times[ch[0]][0], times[ch[-1]][1] + 0.35
    if n + 1 < len(events):
        en = min(en, times[events[n + 1][0]][0] - 0.02)
    en = max(en, times[ch[-1]][1])
    parts, cur = [], st
    for k in ch:
        ws, we = times[k]
        parts.append(f"{{\\k{max(0, round((ws - cur) * 100))}}}{{\\kf{max(1, round((we - ws) * 100))}}}{sw[k][1]}")
        cur = we
    ass.append(f"Dialogue: 0,{ts(st)},{ts(en)},Sub,{spk},0,0,0,,{{\\1c{bgr(G['colores'][spk])}\\2c&H00FFFFFF&}}{' '.join(parts)}\n")
ass_path = os.path.join(tmp, "subs.ass")
open(ass_path, "w", encoding="utf-8").writelines(ass)

# 4) unir clips + cierre, gancho y subtítulos
inputs, fc, cat = [], "", ""
for ci, c in enumerate(clips):
    inputs += ["-i", c]
    dl = ""
    if G.get("delogo"):   # p.ej. "x=603:y=1232:w=104:h=36" (marca Dola AI en 720x1280)
        dl = f"delogo={G['delogo']},"
    fc += (f"[{ci}:v]{dl}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24[v{ci}];"
           f"[{ci}:a]aresample=48000,aformat=channel_layouts=stereo[a{ci}];")
    cat += f"[v{ci}][a{ci}]"
n = len(clips)
if G.get("cierre"):
    end = os.path.join(tmp, "end.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=24:d=3",
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "3", "-vf",
         f"drawtext=fontfile={FONT}:text='{G['cierre']}':fontsize=90:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", end])
    inputs += ["-i", end]
    fc += f"[{n}:v]setsar=1,fps=24[v{n}];[{n}:a]aformat=channel_layouts=stereo[a{n}];"
    cat += f"[v{n}][a{n}]"
    n += 1
fc += f"{cat}concat=n={n}:v=1:a=1[vc][a];[vc]"
alpha = "alpha='if(lt(t,2.6),1,max(0,1-(t-2.6)/0.4))':enable='lt(t,3)'"
for k, line in enumerate(G.get("gancho", [])):
    col = "white" if k == 0 else "0xFFD23F"
    fc += (f"drawtext=fontfile={FONT}:text='{line}':fontsize=54:fontcolor={col}:borderw=4:"
           f"bordercolor=black@0.8:x=(w-text_w)/2:y=h*0.11+{72 * k}:{alpha},")
fc += f"ass={ass_path}:fontsdir={FONTDIR}[v]"
run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
     "-c:v", "libx264", "-crf", "17", "-preset", os.environ.get("X264_PRESET", "medium"), "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out_mp4])
print("OK", out_mp4, "bloques:", len(events))
