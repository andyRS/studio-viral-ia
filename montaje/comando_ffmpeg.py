"""Filtros fuera de la línea de comandos (límite de CreateProcess en Windows)."""
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
import subprocess
import tempfile


@lru_cache(maxsize=8)
def opcion_filtro_archivo(ejecutable):
    # FFmpeg antiguo acepta *_script; las versiones nuevas usan -/opción.
    ayuda = subprocess.run([ejecutable, "-hide_banner", "-h", "full"],
                           capture_output=True, text=True, errors="replace", check=True)
    return ("-filter_complex_script" if "-filter_complex_script " in ayuda.stdout + ayuda.stderr
            else "-/filter_complex")


@contextmanager
def filtros_en_archivos(comando):
    """Conserva los archivos hasta que el proceso termine, también en reintentos."""
    cmd = list(comando)
    if "-filter_complex" not in cmd:
        yield cmd
        return
    opcion = opcion_filtro_archivo(cmd[0])
    with tempfile.TemporaryDirectory(prefix="ff-filtros-") as carpeta:
        for i in range(len(cmd) - 1):
            if cmd[i] == "-filter_complex":
                archivo = Path(carpeta) / f"grafo-{i}.txt"
                archivo.write_text(cmd[i + 1], encoding="utf-8")
                cmd[i:i + 2] = [opcion, str(archivo)]
        yield cmd
