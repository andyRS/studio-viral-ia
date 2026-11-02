"""Mejora los rostros de un vídeo con IA (GFPGAN 1.4), como el cuaderno de Colab de GFPGAN, pero local y
sin instalar basicsr/gfpgan: modelos ONNX con la GPU NVIDIA (onnxruntime, el mismo que usa «Borrar con IA").

Uso:
  python mejorar_rostros.py entrada.mp4 salida.mp4 '{"peso": 0.6, "alto": 1080}'

- «alto»: lado corto del vídeo final (720, 1080 o 1440). El fondo se escala con lanczos y nitidez suave;
  cada rostro se reconstruye con GFPGAN a 512×512 y se pega de vuelta con bordes difuminados.
- «peso» (0-1): cuánto del rostro restaurado se usa (0,6 por defecto). Más alto = más nítido pero puede
  cambiar rasgos; más bajo = conserva más la cara original (importante para la identidad de las fichas).
- Rostros de menos de 40 px no se tocan (GFPGAN los inventaría). Los puntos de la cara se suavizan entre
  fotogramas para que no tiemble. El audio se copia.
- Modelos (se descargan solos una vez, en %USERPROFILE%/.cache/estudio-viral):
    gfpgan_1.4.onnx (~340 MB) y yunet.onnx (detector de caras de OpenCV, ~0,2 MB).
- Imprime «PROGRESO <0-100> <mensaje>» como el montaje.
"""
import json, os, subprocess, sys, urllib.request
import numpy as np

CACHE = os.path.join(os.path.expanduser("~"), ".cache", "estudio-viral")
MODELOS = {
    "gfpgan": ("https://huggingface.co/facefusion/models-3.0.0/resolve/main/gfpgan_1.4.onnx", "gfpgan_1.4.onnx", 300_000_000),
    "yunet": ("https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx", "yunet.onnx", 200_000),
}
# Plantilla de 5 puntos de FFHQ a 512×512 (ojo izq., ojo der., nariz, boca izq., boca der.; izquierda = de la imagen).
PLANTILLA = np.array([[192.98138, 239.94708], [318.90277, 240.19360], [256.63416, 314.01935],
                      [201.26117, 371.41043], [313.08905, 371.15118]], dtype=np.float32)
MIN_CARA = 40


def progreso(pct, msg):
    print(f"PROGRESO {int(pct)} {msg}", flush=True)


def modelo(clave):
    url, nombre, minimo = MODELOS[clave]
    ruta = os.path.join(CACHE, nombre)
    if os.path.exists(ruta) and os.path.getsize(ruta) >= minimo:
        return ruta
    os.makedirs(CACHE, exist_ok=True)
    progreso(1, f"Descargando el modelo {nombre} (una sola vez)")
    tmp = ruta + ".part"
    urllib.request.urlretrieve(url, tmp)
    os.replace(tmp, ruta)
    return ruta


def sesion(ruta):
    import onnxruntime as ort
    if hasattr(ort, "preload_dlls"):
        try:
            ort.preload_dlls()
        except Exception:
            pass
    disp = ort.get_available_providers()
    prov = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider") if p in disp]
    try:
        s = ort.InferenceSession(ruta, providers=prov)
    except Exception:
        s = ort.InferenceSession(ruta, providers=["CPUExecutionProvider"])
    return s, "GPU" if "CUDAExecutionProvider" in s.get_providers() else "procesador"


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", path], capture_output=True, text=True)
    j = json.loads(r.stdout)
    st = j["streams"][0]
    num, den = (int(v) for v in st["r_frame_rate"].split("/"))
    fps = num / max(den, 1)
    dur = float(j["format"].get("duration") or 0)
    total = int(st.get("nb_frames") or 0) or int(dur * fps)
    return int(st["width"]), int(st["height"]), st["r_frame_rate"], fps, max(1, total)


def tam_salida(w, h, alto):
    """Lado corto = alto (sin pasar de 2× el original), dimensiones pares."""
    corto = min(w, h)
    f = min(2.0, max(1.0, alto / corto)) if alto else 1.0
    return int(round(w * f / 2)) * 2, int(round(h * f / 2)) * 2


def puntos_ordenados(p):
    """YuNet da ojo der., ojo izq., nariz, boca der., boca izq.; se ordenan por x como en la plantilla."""
    ojos = sorted(p[0:2].tolist(), key=lambda q: q[0])
    boca = sorted(p[3:5].tolist(), key=lambda q: q[0])
    return np.array([ojos[0], ojos[1], p[2].tolist(), boca[0], boca[1]], dtype=np.float32)


def mascara_base():
    import cv2
    m = np.zeros((512, 512), np.float32)
    cv2.rectangle(m, (26, 26), (486, 486), 1.0, -1)
    return cv2.GaussianBlur(m, (0, 0), 14)


def restaurar(gfp, entrada_nombre, recorte, peso):
    x = recorte[:, :, ::-1].astype(np.float32) / 255.0          # BGR → RGB, 0-1
    x = (x - 0.5) / 0.5
    x = np.transpose(x, (2, 0, 1))[None]
    y = gfp.run(None, {entrada_nombre: x})[0][0]
    y = np.clip(y, -1, 1)
    y = ((np.transpose(y, (1, 2, 0)) + 1) / 2 * 255.0)[:, :, ::-1]
    return np.clip(peso * y + (1 - peso) * recorte.astype(np.float32), 0, 255)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--descargar":   # lo usa iniciar.ps1 para bajar los modelos al instalar
        modelo("gfpgan"); modelo("yunet")
        return
    import cv2
    src, out = sys.argv[1], sys.argv[2]
    op = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    peso = float(min(1.0, max(0.0, op.get("peso", 0.6))))
    alto = int(op.get("alto") or 1080)
    w, h, rate, fps, total = probe(src)
    W, H = tam_salida(w, h, alto)
    gfp, donde = sesion(modelo("gfpgan"))
    entrada = gfp.get_inputs()[0].name
    det = cv2.FaceDetectorYN.create(modelo("yunet"), "", (W, H), 0.7, 0.3, 5000)
    progreso(3, f"Mejorando rostros con GFPGAN en la {donde}: {w}×{h} → {W}×{H}, {total} fotogramas")
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    nv = os.environ.get("VIDEO_ENCODER") == "h264_nvenc"
    venc = ["-c:v", "h264_nvenc", "-preset", "p6", "-rc", "vbr", "-cq", "18", "-b:v", "0"] if nv else ["-c:v", "libx264", "-crf", "16", "-preset", "medium"]
    enc_cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", rate, "-i", "-",
               "-i", src, "-map", "0:v", "-map", "1:a?", *venc, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out]
    enc = subprocess.Popen(enc_cmd, stdin=subprocess.PIPE)
    base = mascara_base()
    previos = []          # puntos de las caras del fotograma anterior, para suavizar el temblor
    tam = w * h * 3
    k, caras_total, ultimo = 0, 0, -1
    while True:
        buf = dec.stdout.read(tam)
        if len(buf) < tam:
            break
        f = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        if (W, H) != (w, h):
            f = cv2.resize(f, (W, H), interpolation=cv2.INTER_LANCZOS4)
            f = cv2.addWeighted(f, 1.35, cv2.GaussianBlur(f, (0, 0), 1.2), -0.35, 0)   # nitidez suave del fondo
        else:
            f = f.copy()
        _, caras = det.detect(f)
        actuales = []
        acum = f.astype(np.float32)
        for c in (caras if caras is not None else []):
            if c[2] < MIN_CARA or c[3] < MIN_CARA:
                continue
            p = puntos_ordenados(c[4:14].reshape(5, 2))
            centro = p.mean(axis=0)
            cerca = min(previos, key=lambda q: np.linalg.norm(q.mean(axis=0) - centro), default=None)
            if cerca is not None and np.linalg.norm(cerca.mean(axis=0) - centro) < 0.25 * c[2]:
                p = 0.6 * p + 0.4 * cerca                       # suavizado: la cara no tiembla entre fotogramas
            actuales.append(p)
            M, _ = cv2.estimateAffinePartial2D(p, PLANTILLA, method=cv2.LMEDS)
            if M is None:
                continue
            recorte = cv2.warpAffine(f, M, (512, 512), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            nueva = restaurar(gfp, entrada, recorte, peso)
            Mi = cv2.invertAffineTransform(M)
            pegada = cv2.warpAffine(nueva, Mi, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            m = cv2.warpAffine(base, Mi, (W, H), flags=cv2.INTER_LINEAR)[:, :, None]
            acum = acum * (1 - m) + pegada * m
            caras_total += 1
        previos = actuales
        enc.stdin.write(np.clip(acum, 0, 255).astype(np.uint8).tobytes())
        k += 1
        pct = int(4 + 94 * k / total)
        if pct != ultimo and (pct % 2 == 0):
            ultimo = pct
            progreso(min(98, pct), f"Fotograma {k} de {total} · {caras_total} rostros mejorados")
    dec.wait()
    enc.stdin.close()
    enc.wait()
    if enc.returncode != 0 or not os.path.exists(out):
        print("Falló la codificación del vídeo", file=sys.stderr)
        sys.exit(1)
    progreso(100, f"Listo: {caras_total} rostros mejorados en {k} fotogramas")


if __name__ == "__main__":
    main()
