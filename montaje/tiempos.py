"""Límites de cada clip en el montaje (sin dependencias: se prueba con `python3 -m unittest montaje/test_tiempos.py`).

Tres duraciones distintas por clip:
  - vídeo generado (D): lo que dura el archivo;
  - voz: de la primera a la última palabra (medida con Whisper en subtitular.py);
  - montaje: el tramo del clip que entra en el vídeo final.

Modos de recorte (guion.json → "montaje": {"modo": ...} para todos, y "tiempos": [{"clip": i, "modo", "margen"}] por clip):
  - "voz"      (viral, por defecto): desde 0,12 s antes de la primera palabra hasta 0,4 s después de la última.
  - "accion"   (cinematográfico): conserva la acción previa corta y `margen` segundos de acción o reacción tras la voz
               (por defecto 1,5 s; nunca menos de 0,4 s); si el clip no da para tanto, se queda entero.
  - "completo": el clip entero.
"""

ANTES_PRIMERA = 0.12
REACCION_MIN = 0.4
MARGEN_ACCION = 1.5
ACCION_PREVIA = 0.5      # en modo acción se conserva hasta medio segundo antes de la voz
MINIMO = 1.2


def config_clip(G, ci):
    """Modo y margen de un clip: lo global de "montaje" y, encima, lo de "tiempos" para ese clip."""
    base = G.get("montaje") or {}
    cfg = {"modo": str(base.get("modo") or "voz"), "margen": base.get("margen")}
    for t in G.get("tiempos") or []:
        try:
            if int(t.get("clip")) == ci:
                cfg.update({k: v for k, v in t.items() if k in ("modo", "margen") and v is not None})
        except (TypeError, ValueError, AttributeError):
            continue
    if cfg["modo"] in ("cinematografico", "cinematográfico"):
        cfg["modo"] = "accion"
    if cfg["modo"] not in ("voz", "accion", "completo"):
        cfg["modo"] = "voz"
    return cfg


def limites_clip(primera, ultima, D, cfg):
    """(a, b): tramo del clip que entra al montaje. primera/ultima en segundos del clip, o None si no hay voz."""
    if primera is None or ultima is None or cfg.get("modo") == "completo":
        return 0.0, D
    if cfg.get("modo") == "accion":
        a = max(0.0, primera - ACCION_PREVIA) if primera > 1.2 else 0.0
        try:
            margen = float(cfg.get("margen") if cfg.get("margen") is not None else MARGEN_ACCION)
        except (TypeError, ValueError):
            margen = MARGEN_ACCION
        b = min(D, ultima + max(REACCION_MIN, margen))
    else:
        a = max(0.0, primera - ANTES_PRIMERA) if primera > 0.35 else 0.0
        b = min(D, ultima + REACCION_MIN) if D - ultima > 0.6 else D
    if b - a < MINIMO:
        return 0.0, D
    return a, b


def avisos_clip(ci, primera, ultima, D, a, b, cfg):
    """Problemas detectables con los tiempos reales de un clip."""
    out = []
    if ultima is not None and D - ultima < 0.15:
        out.append(f"Clip {ci + 1}: la voz llega hasta el final del clip ({ultima:.1f} de {D:.1f} s): la frase puede estar cortada.")
    if primera is not None and primera < 0.05:
        out.append(f"Clip {ci + 1}: la voz empieza en el primer fotograma: puede faltar el inicio de la frase.")
    if cfg.get("modo") == "accion" and ultima is not None:
        margen = float(cfg.get("margen") if cfg.get("margen") is not None else MARGEN_ACCION)
        if b - ultima < min(margen, 0.6) - 0.05:
            out.append(f"Clip {ci + 1}: solo quedan {max(0.0, b - ultima):.1f} s de acción tras la voz (se pidieron {margen:.1f} s): el clip termina antes de completar la acción.")
    return out


def corte_j_seguro(voz_fin_prev, a_prev, b_prev, vel, j):
    """Un corte J adelanta la voz siguiente `j` s sobre la imagen anterior: solo si la voz anterior ya terminó."""
    if voz_fin_prev is None:
        return True
    return (b_prev - voz_fin_prev) / vel >= j + 0.05
