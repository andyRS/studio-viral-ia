"""«Para el chat»: cualquier vídeo cabe en un tamaño máximo (30 MB por defecto) para poder revisarlo.

Sin dependencias (se prueba con `python3 -m unittest montaje/test_tiempos.py`).
- Si con ese peso aún se ve bien (≥ 300 kbps de vídeo), sale un solo archivo: el bitrate se calcula con la duración.
- Si no (una película entera), se parte en trozos que pesan cada uno menos del máximo, a 360p legible:
  mejor varias partes que se entienden que una sola hecha papilla.
"""

MARGEN = 0.93          # contenedor, picos del codificador: se apunta un 7 % por debajo
MIN_VIDEO = 300        # kbps: por debajo, un solo archivo ya no sirve para revisar
VIDEO_PARTES = 380     # kbps de vídeo de cada parte (360p)
MAX_PARTES = 40


def presupuesto_kbit(objetivo_mb):
    return objetivo_mb * 1024 * 1024 * 8 / 1000 * MARGEN


def audio_para(total_kbps):
    """(bitrate, canales): la voz tiene que entenderse siempre."""
    if total_kbps >= 900:
        return 96, 2
    if total_kbps >= 500:
        return 64, 2
    return 48, 1


def lado_corto(video_kbps):
    if video_kbps >= 1600:
        return 720
    if video_kbps >= 750:
        return 540
    if video_kbps >= 450:
        return 480
    return 360


def plan_chat(dur, objetivo_mb=29):
    """Plan de compresión: lista de partes {inicio, dur, video_kbps, audio_kbps, canales, alto}."""
    dur = max(1.0, float(dur))
    total = presupuesto_kbit(objetivo_mb) / dur
    a, ch = audio_para(total)
    v = total - a
    if v >= MIN_VIDEO:
        return [{"inicio": 0.0, "dur": dur, "video_kbps": int(min(v, 4000)), "audio_kbps": a, "canales": ch, "alto": lado_corto(v)}]
    a, ch = 64, 2
    por_parte = presupuesto_kbit(objetivo_mb) / (VIDEO_PARTES + a)       # segundos que caben en cada archivo
    n = min(MAX_PARTES, int(-(-dur // por_parte)))
    largo = dur / n
    v = int(presupuesto_kbit(objetivo_mb) / largo - a)
    return [{"inicio": round(i * largo, 3), "dur": round(largo if i < n - 1 else dur - i * largo, 3),
             "video_kbps": min(v, 4000), "audio_kbps": a, "canales": ch, "alto": lado_corto(v)} for i in range(n)]


def reajuste(bitrate, peso, objetivo_bytes):
    """Si una parte se pasó del máximo, nuevo bitrate de vídeo proporcional (con un 5 % extra de margen)."""
    return int(bitrate * objetivo_bytes / peso * 0.95)
