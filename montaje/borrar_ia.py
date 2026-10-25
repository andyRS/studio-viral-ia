"""Borra marcas de agua con IA (LaMa): redibuja el fondo detrás del logo en cada fotograma, como las
herramientas profesionales de «quitar logo». Gratis y local: usa la GPU NVIDIA si está disponible.

Uso:
  python borrar_ia.py entrada.mp4 salida.mp4 '[{"x":614,"y":1220,"w":66,"h":38}]'

- Las zonas van en píxeles del vídeo de entrada (hasta 6). El audio se copia tal cual.
- Modelo: big-lama en ONNX (~200 MB), en %USERPROFILE%/.cache/estudio-viral/lama_fp32.onnx (se descarga solo).
- Imprime «PROGRESO <0-100> <mensaje>» como el montaje.
"""
import json, os, subprocess, sys, urllib.request
import numpy as np
from PIL import Image, ImageFilter

MODELO_URL = "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx"
MODELO = os.path.join(os.path.expanduser("~"), ".cache", "estudio-viral", "lama_fp32.onnx")
LADO = 512   # el modelo trabaja en 512×512


def progreso(pct, msg):
    print(f"PROGRESO {int(pct)} {msg}", flush=True)


def asegurar_modelo():
    if os.path.exists(MODELO) and os.path.getsize(MODELO) > 150_000_000:
        return MODELO
    os.makedirs(os.path.dirname(MODELO), exist_ok=True)
    progreso(1, "Descargando el modelo de IA (una sola vez, ~200 MB)")
    tmp = MODELO + ".part"
    urllib.request.urlretrieve(MODELO_URL, tmp)
    os.replace(tmp, MODELO)
    return MODELO


def sesion():
    import onnxruntime as ort
    if hasattr(ort, "preload_dlls"):   # DLL de CUDA/cuDNN instaladas con pip (sin instalar CUDA aparte)
        try:
            ort.preload_dlls()
        except Exception:
            pass
    disp = ort.get_available_providers()
    prov = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider") if p in disp]
    try:
        s = ort.InferenceSession(asegurar_modelo(), providers=prov)
    except Exception:
        s = ort.InferenceSession(asegurar_modelo(), providers=["CPUExecutionProvider"])
    return s, "GPU" if "CUDAExecutionProvider" in s.get_providers() else "procesador"


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate:format=duration", "-of", "json", path], capture_output=True, text=True)
    j = json.loads(r.stdout)
    st = j["streams"][0]
    num, den = (int(v) for v in st["r_frame_rate"].split("/"))
    return int(st["width"]), int(st["height"]), st["r_frame_rate"], num / max(den, 1), float(j["format"].get("duration") or 0)


def ventanas(zonas, W, H):
    """Para cada zona: recorte cuadrado alrededor (con contexto para que la IA vea el fondo), máscara
    para el modelo (512) y máscara suavizada para pegar el resultado sin bordes."""
    out = []
    for z in zonas[:6]:
        x, y, w, h = (int(round(float(z[k]))) for k in ("x", "y", "w", "h"))
        x, y = max(0, min(x, W - 2)), max(0, min(y, H - 2))
        w, h = max(2, min(w, W - x)), max(2, min(h, H - y))
        S = min(min(W, H), max(256, 3 * max(w, h)))
        x0 = max(0, min(W - S, x + w // 2 - S // 2)); y0 = max(0, min(H - S, y + h // 2 - S // 2))
        m = np.zeros((S, S), np.uint8)
        pad = max(4, int(0.08 * max(w, h)))   # margen: que no quede ni el borde del logo
        m[max(0, y - y0 - pad):min(S, y - y0 + h + pad), max(0, x - x0 - pad):min(S, x - x0 + w + pad)] = 255
        m512 = (np.array(Image.fromarray(m).resize((LADO, LADO), Image.NEAREST)) > 127).astype(np.float32)
        suave = np.array(Image.fromarray(m).filter(ImageFilter.GaussianBlur(max(2, pad // 2)))).astype(np.float32)[..., None] / 255
        suave = np.maximum(suave, (m[..., None] > 0) * 0.0)
        out.append((x0, y0, S, m512, suave))
    return out


def main():
    src, dst, zonas = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
    W, H, rate, fps, dur = probe(src)
    total = max(1, int(dur * fps))
    sess, dev = sesion()
    progreso(3, f"Borrando con IA en la {dev} ({total} fotogramas)")
    vs = ventanas(zonas, W, H)
    nv = os.environ.get("VIDEO_ENCODER") == "h264_nvenc"
    venc = ["-c:v", "h264_nvenc", "-preset", "p6", "-rc", "vbr", "-cq", "18", "-b:v", "0"] if nv else ["-c:v", "libx264", "-crf", "17", "-preset", "medium"]
    lee = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    escribe = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", rate, "-i", "-",
                                "-i", src, "-map", "0:v", "-map", "1:a?", *venc, "-pix_fmt", "yuv420p", "-c:a", "copy",
                                "-movflags", "+faststart", "-shortest", dst], stdin=subprocess.PIPE)
    previo = [None] * len(vs)
    n, tam = 0, W * H * 3
    while True:
        buf = lee.stdout.read(tam)
        if len(buf) < tam:
            break
        fr = np.frombuffer(buf, np.uint8).reshape(H, W, 3).copy()
        lotes = [np.array(Image.fromarray(fr[y0:y0 + S, x0:x0 + S]).resize((LADO, LADO), Image.BICUBIC)).astype(np.float32).transpose(2, 0, 1) / 255
                 for x0, y0, S, _, _ in vs]
        res = sess.run(None, {"image": np.stack(lotes), "mask": np.stack([m[None] for *_, m, _ in vs])})[0]
        for k, (x0, y0, S, _, suave) in enumerate(vs):
            o = res[k].transpose(1, 2, 0)
            o = o if o.max() > 2 else o * 255
            o = np.array(Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)).astype(np.float32)
            # Suavizado en el tiempo: evita que el relleno «tiemble» de un fotograma a otro.
            if previo[k] is not None:
                o = 0.7 * o + 0.3 * previo[k]
            previo[k] = o
            zona = fr[y0:y0 + S, x0:x0 + S].astype(np.float32)
            fr[y0:y0 + S, x0:x0 + S] = np.clip(zona * (1 - suave) + o * suave, 0, 255).astype(np.uint8)
        escribe.stdin.write(fr.tobytes())
        n += 1
        if n % 24 == 0:
            progreso(3 + 95 * min(1, n / total), f"Borrando con IA: fotograma {n} de {total}")
    escribe.stdin.close()
    lee.wait()
    if escribe.wait() != 0:
        raise SystemExit("ffmpeg falló al escribir el vídeo")
    progreso(100, "Listo")


if __name__ == "__main__":
    if sys.argv[1:] == ["--descargar"]:   # lo usa «Montar en mi PC» al instalar
        asegurar_modelo()
    else:
        main()
